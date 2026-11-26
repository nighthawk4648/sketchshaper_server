// Next.js only caches 200 responses, so a 404 never replaces the website's cached copy of a deleted
// item and the page stays up. When the website asks (x-soft-404), a 404 goes out as 200 + x-not-found.
export const softNotFound = (req, res, next) => {
  if (req.get("x-soft-404")) {
    const status = res.status.bind(res);
    res.status = (code) => (code === 404 ? status(200).set("x-not-found", "1") : status(code));
  }
  next();
};
