// Public resume/CV URLs. Always the latest published PDF from the "resume" blob store,
// never cached, so the LinkedIn Featured link and site links pick up each publish.
import { getStore } from "@netlify/blobs";

const ROUTES = {
  "/resume.pdf": "robotics",
  "/resume-robotics.pdf": "robotics",
  "/resume-mech.pdf": "mech",
  "/resume-scholarship.pdf": "scholarship",
  "/cv.pdf": "cv",
};
// Netlify reads config statically, so the paths must be written out literally (not Object.keys(ROUTES)).
export const config = { path: ["/resume.pdf", "/resume-robotics.pdf", "/resume-mech.pdf", "/resume-scholarship.pdf", "/cv.pdf"] };

const FILENAMES = { robotics: "Chase_Bonfiglio_Resume", mech: "Chase_Bonfiglio_Resume_ME",
  scholarship: "Chase_Bonfiglio_Resume_Scholarship", cv: "Chase_Bonfiglio_CV" };

export default async (req) => {
  const doc = ROUTES[new URL(req.url).pathname];
  const buf = doc && (await getStore({ name: "resume", consistency: "strong" }).get(`pdf/live/${doc}`, { type: "arrayBuffer" }));
  if (!buf) return new Response("Not published yet", { status: 404, headers: { "cache-control": "no-cache" } });
  return new Response(buf, { headers: {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${FILENAMES[doc]}.pdf"`,
    "cache-control": "no-cache, must-revalidate",
    "netlify-cdn-cache-control": "no-store",
  }});
};
