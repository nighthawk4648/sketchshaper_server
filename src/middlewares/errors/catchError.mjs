const catchError = (controller) => {
  return async (req, res, next) => {
    try {
      await controller(req, res, next);
    } catch (err) {
      console.error(err);
      next(err);
    }
  };
};

export default catchError;
