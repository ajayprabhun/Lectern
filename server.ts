import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import { extractText } from 'unpdf';
import { generateStudyNotesFromTranscript } from './src/services/geminiServer.ts';
import type { PdfExportRequest } from './src/types/study.ts';
import { buildStudyNotesPdf } from './src/utils/pdfGenerator.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Load Firebase projectId from firebase-applet-config.json for ID token verification
let firebaseProjectId = '';
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { projectId?: string };
    firebaseProjectId = raw.projectId || '';
  }
} catch {
  firebaseProjectId = '';
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache = { certs: {}, expiresAt: 0 };

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (Date.now() < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Unable to fetch Firebase public verification certificates.');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;
  certCache = {
    certs,
    expiresAt: Date.now() + maxAgeSeconds * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as T;
}

async function verifyFirebaseBearerToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const parts = token.split('.');
    if (parts.length !== 3) {
      res.status(401).json({ error: 'Invalid authentication token format.' });
      return;
    }

    const [headerB64, payloadB64, sigB64] = parts;
    const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
    const payload = decodeBase64UrlJson<{
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      email_verified?: boolean;
    }>(payloadB64);

    if (header.alg !== 'RS256' || !header.kid) {
      res.status(401).json({ error: 'Unsupported token signing algorithm.' });
      return;
    }

    if (firebaseProjectId) {
      if (payload.aud !== firebaseProjectId) {
        res.status(401).json({ error: 'Token audience mismatch.' });
        return;
      }
      if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
        res.status(401).json({ error: 'Token issuer mismatch.' });
        return;
      }
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSec || !payload.sub) {
      res.status(401).json({ error: 'Authentication token expired. Please refresh.' });
      return;
    }

    const certs = await getGooglePublicCerts();
    const cert = certs[header.kid];
    if (!cert) {
      res.status(401).json({ error: 'Unknown token signing key.' });
      return;
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const sigNorm = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const sigBuf = Buffer.from(sigNorm + '='.repeat((4 - (sigNorm.length % 4)) % 4), 'base64');
    const isValidSig = verifier.verify(cert, sigBuf);

    if (!isValidSig) {
      res.status(401).json({ error: 'Invalid authentication signature.' });
      return;
    }

    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    res.status(401).json({ error: 'Unable to verify authentication session.' });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.txt', '.md', '.pdf', '.docx'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload a .txt, .pdf, or .docx file.'));
    }
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Extract plain text from uploaded .txt, .pdf, or .docx transcript
  app.post(
    '/api/transcript/extract',
    verifyFirebaseBearerToken,
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : 'File upload failed.' });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No transcript file was uploaded.' });
          return;
        }

        const ext = path.extname(file.originalname).toLowerCase();
        let extractedText = '';

        if (ext === '.txt' || ext === '.md') {
          extractedText = file.buffer.toString('utf-8');
        } else if (ext === '.docx') {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText = result.value || '';
        } else if (ext === '.pdf') {
          const result = await extractText(new Uint8Array(file.buffer), { mergePages: true });
          const rawText: string | string[] = result.text;
          extractedText = Array.isArray(rawText) ? rawText.join('\n') : rawText || '';
        }

        const cleaned = extractedText.replace(/\r\n/g, '\n').trim();
        if (!cleaned) {
          res.status(422).json({
            error: 'No readable text could be extracted from this file. Check that the file is not scanned images only.',
          });
          return;
        }

        const truncated = cleaned.length > 250000 ? cleaned.slice(0, 250000) : cleaned;
        const wordCount = truncated.split(/\s+/).filter(Boolean).length;

        res.json({
          text: truncated,
          fileName: file.originalname,
          charCount: truncated.length,
          wordCount,
          wasTruncated: cleaned.length > 250000,
        });
      } catch (err) {
        console.error('Transcript extract error:', err);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to parse the uploaded transcript file.',
        });
      }
    }
  );

  // Generate structured study notes via Gemini Flash (supports SSE progress streaming)
  app.post('/api/notes/generate', verifyFirebaseBearerToken, async (req: Request, res: Response) => {
    const body = req.body as {
      transcript?: string;
      subjectName?: string;
      weekNumber?: number;
      lectureTitle?: string;
      stream?: boolean;
    };

    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    if (!transcript || transcript.length < 20) {
      res.status(400).json({ error: 'Please provide at least 20 characters of lecture transcript text.' });
      return;
    }

    const subjectName = typeof body.subjectName === 'string' && body.subjectName.trim()
      ? body.subjectName.trim().slice(0, 120)
      : 'General Studies';
    const weekNumber = Number.isFinite(body.weekNumber) ? Number(body.weekNumber) : 1;
    const lectureTitle = typeof body.lectureTitle === 'string' && body.lectureTitle.trim()
      ? body.lectureTitle.trim().slice(0, 200)
      : 'Lecture Notes';

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await generateStudyNotesFromTranscript({
          transcript,
          subjectName,
          weekNumber,
          lectureTitle,
          onProgress: (progress) => sendEvent('progress', progress),
        });
        sendEvent('result', result);
        res.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate study notes.';
        console.error('Gemini stream generation error:', err);
        sendEvent('error', { error: message });
        res.end();
      }
      return;
    }

    try {
      const result = await generateStudyNotesFromTranscript({
        transcript,
        subjectName,
        weekNumber,
        lectureTitle,
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate study notes.';
      console.error('Gemini generation error:', err);
      const status = message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID') ? 403 : 500;
      res.status(status).json({ error: message });
    }
  });

  // Export structured study notes as a downloadable PDF built on Node.js
  app.post('/api/pdf/export', verifyFirebaseBearerToken, async (req: Request, res: Response) => {
    try {
      const payload = req.body as Partial<PdfExportRequest>;
      if (!payload || typeof payload.lectureTitle !== 'string') {
        res.status(400).json({ error: 'Invalid PDF export payload.' });
        return;
      }

      const pdfBytes = await buildStudyNotesPdf({
        subjectName: String(payload.subjectName || 'Subject').slice(0, 120),
        subjectCode: String(payload.subjectCode || '').slice(0, 24),
        weekNumber: Number(payload.weekNumber) || 1,
        weekTitle: String(payload.weekTitle || 'Week').slice(0, 160),
        lectureTitle: String(payload.lectureTitle || 'Lecture Notes').slice(0, 200),
        tags: Array.isArray(payload.tags) ? payload.tags.map(String).slice(0, 10) : [],
        revisionReady: Boolean(payload.revisionReady),
        notesSummary: String(payload.notesSummary || '').slice(0, 20000),
        notesBullets: Array.isArray(payload.notesBullets) ? payload.notesBullets.map(String).slice(0, 60) : [],
        notesDefinitions: Array.isArray(payload.notesDefinitions)
          ? payload.notesDefinitions
              .filter((d) => d && typeof d.term === 'string' && typeof d.definition === 'string')
              .slice(0, 40)
          : [],
        notesExamples: Array.isArray(payload.notesExamples) ? payload.notesExamples.map(String).slice(0, 30) : [],
      });

      const safeFilename = (payload.lectureTitle || 'study-notes')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'study-notes';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error('PDF export error:', err);
      res.status(500).json({ error: 'Failed to generate PDF document.' });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lectern server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
