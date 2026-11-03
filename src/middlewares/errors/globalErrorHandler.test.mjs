import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import globalErrorHandler from './globalErrorHandler.mjs';

describe('globalErrorHandler', () => {
  it('handles Prisma unique constraint collision (P2002) with 409 status', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const res = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    const prismaError = new Error('Unique constraint failed on the fields: (`slug`)');
    prismaError.code = 'P2002';

    globalErrorHandler(prismaError, {}, res, () => {});

    assert.equal(capturedStatus, 409);
    assert.equal(capturedJson.status, 'error');
    assert.equal(capturedJson.code, 409);
    assert.equal(
      capturedJson.message,
      'This URL slug or unique value is already taken. Please choose a different one.'
    );
  });

  it('handles standard 400 Bad Request error correctly', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const res = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    const badRequest = new Error('A valid URL slug with at least one letter or number is required.');
    badRequest.status = 400;

    globalErrorHandler(badRequest, {}, res, () => {});

    assert.equal(capturedStatus, 400);
    assert.equal(capturedJson.code, 400);
    assert.equal(
      capturedJson.message,
      'A valid URL slug with at least one letter or number is required.'
    );
  });

  it('defaults unhandled errors to 500 status', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const res = {
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    const randomError = new Error('Unexpected database failure');

    globalErrorHandler(randomError, {}, res, () => {});

    assert.equal(capturedStatus, 500);
    assert.equal(capturedJson.code, 500);
    assert.equal(capturedJson.message, 'Unexpected database failure');
  });
});

