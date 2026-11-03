const globalErrorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  let statusCode = 500;
  if (typeof err.status === 'number' && err.status >= 100 && err.status < 600) {
    statusCode = err.status;
  } else if (typeof err.statusCode === 'number' && err.statusCode >= 100 && err.statusCode < 600) {
    statusCode = err.statusCode;
  }

  let message = err.message || 'Internal Server Error';

  // Handle Prisma unique constraint violations (code P2002)
  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'This URL slug or unique value is already taken. Please choose a different one.';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value entered';
  }

  return res.status(statusCode).json({
    status: 'error',
    code: statusCode,
    message
  });
};

export default globalErrorHandler;
