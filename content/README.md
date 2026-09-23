# Adding content without rewriting a page

Each project page renders whatever is in its file here, in order, into an
"added" section just above the timeline. A page with an empty file looks
exactly as it does now. Adding a video or a number means appending one object
to a file - no existing sentence is touched, so there is nothing to re-read.

Block types:

    {"type":"video",  "src":"/assets/vid/dart-throw.mp4", "poster":"/assets/imgs/dart-poster.webp",
     "caption":"Throw to score, one take.", "date":"2026-09-24"}

    {"type":"embed",  "url":"https://www.youtube.com/embed/XXXX", "caption":"...", "date":"..."}

    {"type":"figure", "src":"/assets/imgs/x.webp", "alt":"what it shows",
     "caption":"...", "date":"..."}

    {"type":"result", "label":"Grasp success", "value":"14 / 20",
     "note":"Run 2, blocks laid singly.", "date":"..."}

    {"type":"note",   "title":"optional", "text":"plain text, blank line for a new paragraph",
     "date":"..."}

Any block may carry "heading" to start a new titled group above it.
Everything is escaped on render, so the text is printed exactly as written.
