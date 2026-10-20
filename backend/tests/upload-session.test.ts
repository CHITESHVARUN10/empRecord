import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

vi.mock('../src/services/storage.service', () => ({
  generateClientUploadToken: vi.fn(),
  inspectAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  storeAttachment: vi.fn(),
  openAttachment: vi.fn(),
}));

import {
  confirmPendingUpload,
  createEditUploadSession,
  createPublicUploadSession,
  finalizeUploadSession,
  getUploadSessionById,
  getUploadSessionStatus,
  issueUploadToken,
  cleanupUploadSessions,
} from '../src/services/upload-session.service';
import {
  generateClientUploadToken,
  inspectAttachment,
  removeAttachment,
} from '../src/services/storage.service';
import { UploadSessionModel } from '../src/models/UploadSession';
import { EmployeeModel } from '../src/models/Employee';
import { validEmployee } from './helpers';

let mongod: MongoMemoryServer;

const uuid = '123e4567-e89b-12d3-a456-426614174000';
const pdfHead = Buffer.from('%PDF-1.4');
const jpegHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function documentMeta(pathname: string, mimeType = 'application/pdf') {
  return {
    pathname,
    originalName: mimeType === 'application/pdf' ? 'aadhaar.pdf' : 'pan.jpg',
    mimeType,
    size: 20,
    uploadedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function pathFor(
  prefix: string,
  kind: 'aadhaar' | 'pan' | 'passport',
  extension: 'pdf' | 'jpg' = 'pdf',
) {
  return `${prefix}/${kind}-${uuid}.${extension}`;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await UploadSessionModel.createIndexes();
  await EmployeeModel.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await UploadSessionModel.deleteMany({});
  await EmployeeModel.deleteMany({});
  vi.clearAllMocks();
  vi.mocked(generateClientUploadToken).mockImplementation(
    async (pathname) => `token:${pathname}`,
  );
  vi.mocked(inspectAttachment).mockResolvedValue({
    size: 20,
    head: pdfHead,
  });
  vi.mocked(removeAttachment).mockResolvedValue(true);
});

describe('upload sessions', () => {
  it('creates a session with a pre-generated employee folder and expiry', async () => {
    const view = await createPublicUploadSession();
    expect(view.mode).toBe('local');
    expect(view.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(view.pathPrefix).toMatch(/[a-f0-9]{24}$/);
    expect(new Date(view.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const session = await getUploadSessionById(view.sessionId);
    expect(session.status).toBe('open');
    expect(String(session.employeeId)).toBe(
      view.pathPrefix.split('/').at(-1),
    );
  });

  it('issues a token and confirms a valid document', async () => {
    const view = await createPublicUploadSession();
    const pathname = pathFor(view.pathPrefix, 'aadhaar');

    const token = await issueUploadToken({
      sessionId: view.sessionId,
      kind: 'aadhaar',
      pathname,
      size: 20,
      mimeType: 'application/pdf',
      originalName: 'aadhaar.pdf',
    });
    expect(token).toBe(`token:${pathname}`);

    const document = await confirmPendingUpload({
      sessionId: view.sessionId,
      kind: 'aadhaar',
      pathname,
    });
    expect(document).toMatchObject({
      kind: 'aadhaar',
      pathname,
      mimeType: 'application/pdf',
      size: 20,
    });

    const status = await getUploadSessionStatus(view.sessionId);
    expect(status.documents.aadhaar?.pathname).toBe(pathname);

    const session = await getUploadSessionById(view.sessionId);
    expect(session.pending.aadhaar).toBeUndefined();
    expect(session.documents.aadhaar?.pathname).toBe(pathname);
  });

  it('accepts JPEG confirmation for PAN', async () => {
    const view = await createPublicUploadSession();
    const pathname = pathFor(view.pathPrefix, 'pan', 'jpg');
    vi.mocked(inspectAttachment).mockResolvedValueOnce({
      size: 20,
      head: jpegHead,
    });

    await issueUploadToken({
      sessionId: view.sessionId,
      kind: 'pan',
      pathname,
      size: 20,
      mimeType: 'image/jpeg',
      originalName: 'pan.jpg',
    });
    const document = await confirmPendingUpload({
      sessionId: view.sessionId,
      kind: 'pan',
      pathname,
    });
    expect(document.mimeType).toBe('image/jpeg');
  });

  it('rejects paths outside the session folder, wrong extensions, and oversized files', async () => {
    const view = await createPublicUploadSession();
    const outside = `${view.pathPrefix}-other/aadhaar-${uuid}.pdf`;

    await expect(
      issueUploadToken({
        sessionId: view.sessionId,
        kind: 'aadhaar',
        pathname: outside,
        size: 20,
        mimeType: 'application/pdf',
        originalName: 'aadhaar.pdf',
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      issueUploadToken({
        sessionId: view.sessionId,
        kind: 'aadhaar',
        pathname: pathFor(view.pathPrefix, 'aadhaar', 'jpg'),
        size: 20,
        mimeType: 'application/pdf',
        originalName: 'aadhaar.pdf',
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      issueUploadToken({
        sessionId: view.sessionId,
        kind: 'aadhaar',
        pathname: pathFor(view.pathPrefix, 'aadhaar'),
        size: 6 * 1024 * 1024,
        mimeType: 'application/pdf',
        originalName: 'aadhaar.pdf',
      }),
    ).rejects.toMatchObject({ status: 413 });

    expect(generateClientUploadToken).not.toHaveBeenCalled();
  });

  it('rejects expired sessions', async () => {
    const view = await createPublicUploadSession();
    const session = await getUploadSessionById(view.sessionId);
    session.expiresAt = new Date(Date.now() - 1000);
    await session.save();

    await expect(
      issueUploadToken({
        sessionId: view.sessionId,
        kind: 'aadhaar',
        pathname: pathFor(view.pathPrefix, 'aadhaar'),
        size: 20,
        mimeType: 'application/pdf',
        originalName: 'aadhaar.pdf',
      }),
    ).rejects.toMatchObject({
      status: 410,
      code: 'UPLOAD_SESSION_EXPIRED',
    });
  });

  it('rejects a confirmation that does not match the pending path', async () => {
    const view = await createPublicUploadSession();
    const first = pathFor(view.pathPrefix, 'aadhaar');
    const second = `${view.pathPrefix}/aadhaar-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf`;

    await issueUploadToken({
      sessionId: view.sessionId,
      kind: 'aadhaar',
      pathname: first,
      size: 20,
      mimeType: 'application/pdf',
      originalName: 'aadhaar.pdf',
    });

    await expect(
      confirmPendingUpload({
        sessionId: view.sessionId,
        kind: 'aadhaar',
        pathname: second,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects invalid blob contents and queues them for cleanup', async () => {
    const view = await createPublicUploadSession();
    const pathname = pathFor(view.pathPrefix, 'aadhaar');
    vi.mocked(inspectAttachment).mockResolvedValueOnce({
      size: 20,
      head: Buffer.from('not-a-pdf'),
    });

    await issueUploadToken({
      sessionId: view.sessionId,
      kind: 'aadhaar',
      pathname,
      size: 20,
      mimeType: 'application/pdf',
      originalName: 'aadhaar.pdf',
    });

    await expect(
      confirmPendingUpload({
        sessionId: view.sessionId,
        kind: 'aadhaar',
        pathname,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(removeAttachment).toHaveBeenCalledWith(pathname);
    const session = await getUploadSessionById(view.sessionId);
    expect(session.pending.aadhaar).toBeUndefined();
    expect(session.documents.aadhaar).toBeUndefined();
  });

  it('requires admin ownership for edit sessions', async () => {
    const employeeId = new Types.ObjectId().toString();
    const view = await createEditUploadSession(employeeId, 'admin-1');

    await expect(
      getUploadSessionStatus(view.sessionId),
    ).rejects.toMatchObject({ status: 401 });

    await expect(
      getUploadSessionStatus(view.sessionId, 'admin-2'),
    ).rejects.toMatchObject({ status: 403 });

    const status = await getUploadSessionStatus(view.sessionId, 'admin-1');
    expect(status.sessionId).toBe(view.sessionId);
  });

  it('finalizes a session by keeping linked paths and deleting the rest', async () => {
    const view = await createPublicUploadSession();
    const session = await getUploadSessionById(view.sessionId);
    const aadhaarPath = pathFor(view.pathPrefix, 'aadhaar');
    const panPath = pathFor(view.pathPrefix, 'pan', 'jpg');
    session.set('documents.aadhaar', documentMeta(aadhaarPath));
    session.set('documents.pan', documentMeta(panPath, 'image/jpeg'));
    await session.save();

    await finalizeUploadSession(session, [aadhaarPath]);

    expect(removeAttachment).toHaveBeenCalledWith(panPath);
    expect(removeAttachment).not.toHaveBeenCalledWith(aadhaarPath);

    const updated = await getUploadSessionById(view.sessionId);
    expect(updated.status).toBe('consumed');
    expect(updated.documents.aadhaar).toBeUndefined();
    expect(updated.documents.pan).toBeUndefined();
  });

  it('cleans expired sessions but never deletes an employee-linked blob', async () => {
    const view = await createPublicUploadSession();
    const session = await getUploadSessionById(view.sessionId);
    const linkedAadhaar = pathFor(view.pathPrefix, 'aadhaar');
    const unlinkedPan = pathFor(view.pathPrefix, 'pan', 'jpg');
    const pendingPath = pathFor(view.pathPrefix, 'passport', 'jpg');
    const oldPath = `${view.pathPrefix}/pan-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg`;

    const employee = await EmployeeModel.create({
      _id: new Types.ObjectId(),
      ...validEmployee({
        employeeCode: 'BPI-201',
        personalEmail: 'cleanup@example.com',
        personalMobile: '9876500101',
        officeMobile: '9876500102',
      }),
      attachments: {
        aadhaar: documentMeta(linkedAadhaar),
        pan: documentMeta(
          `${view.pathPrefix}/pan-ffffffff-aaaa-bbbb-cccc-dddddddddddd.jpg`,
          'image/jpeg',
        ),
      },
    });
    expect(employee.attachments.aadhaar.pathname).toBe(linkedAadhaar);

    session.set('documents.aadhaar', documentMeta(linkedAadhaar));
    session.set('documents.pan', documentMeta(unlinkedPan, 'image/jpeg'));
    session.set('pending.passport', {
      pathname: pendingPath,
      originalName: 'passport.jpg',
      declaredMimeType: 'image/jpeg',
      declaredSize: 20,
      createdAt: new Date(),
    });
    session.cleanupPathnames = [oldPath];
    session.expiresAt = new Date(Date.now() - 1000);
    await session.save();

    const result = await cleanupUploadSessions(10);

    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(removeAttachment).not.toHaveBeenCalledWith(linkedAadhaar);
    expect(removeAttachment).toHaveBeenCalledWith(unlinkedPan);
    expect(removeAttachment).toHaveBeenCalledWith(pendingPath);
    expect(removeAttachment).toHaveBeenCalledWith(oldPath);

    expect(await UploadSessionModel.findOne({ sessionId: view.sessionId }))
      .toBeNull();
  });
});
