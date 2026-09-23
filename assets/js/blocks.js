/* content blocks - chasebonfiglio.com
   A page says where additions go:
       <div data-blocks="dart"></div>
   and content/dart.json holds an array of blocks. Adding a video or a result is
   appending an object to that file; no existing sentence moves.

   Block types:
     {"type":"video",  "src":"...mp4", "poster":"...webp", "caption":"...", "date":"2026-09-24"}
     {"type":"embed",  "url":"https://www.youtube.com/embed/ID", "caption":"...", "date":"..."}
     {"type":"figure", "src":"...webp", "alt":"...", "caption":"...", "date":"..."}
     {"type":"result", "label":"Segments called correctly", "value":"53 / 71", "note":"...", "date":"..."}
     {"type":"note",   "title":"optional", "text":"plain text, no markup", "date":"..."}
   Every block may carry "heading" to start a new titled group.
*/
(function () {
  var mounts = [].slice.call(document.querySelectorAll("[data-blocks]"));
  if (!mounts.length) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var when = function (d) {
    if (!d) return "";
    var t = new Date(d + "T00:00:00");
    if (isNaN(t)) return esc(d);
    return t.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  var render = {
    video: function (b) {
      return '<figure class="blk blk--video">' +
        '<video controls preload="none"' + (b.poster ? ' poster="' + esc(b.poster) + '"' : "") + '>' +
        '<source src="' + esc(b.src) + '" type="' + esc(b.mime || "video/mp4") + '">' +
        "</video>" + cap(b) + "</figure>";
    },
    embed: function (b) {
      return '<figure class="blk blk--video"><div class="blk__ratio">' +
        '<iframe src="' + esc(b.url) + '" title="' + esc(b.caption || "Video") + '" loading="lazy" ' +
        'allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
        "</div>" + cap(b) + "</figure>";
    },
    figure: function (b) {
      return '<figure class="blk blk--figure">' +
        '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || b.caption || "") + '" loading="lazy">' +
        cap(b) + "</figure>";
    },
    result: function (b) {
      return '<div class="blk blk--result">' +
        '<span class="blk__label">' + esc(b.label) + "</span>" +
        '<span class="blk__value">' + esc(b.value) + "</span>" +
        (b.note ? '<span class="blk__note">' + esc(b.note) + "</span>" : "") +
        stamp(b) + "</div>";
    },
    note: function (b) {
      return '<div class="blk blk--note">' +
        (b.title ? "<b>" + esc(b.title) + "</b>" : "") +
        "<p>" + esc(b.text).replace(/\n\n+/g, "</p><p>") + "</p>" + stamp(b) + "</div>";
    }
  };

  function cap(b) {
    if (!b.caption && !b.date) return "";
    return "<figcaption>" + esc(b.caption || "") + stamp(b) + "</figcaption>";
  }
  function stamp(b) {
    return b.date ? '<time class="blk__when" datetime="' + esc(b.date) + '">' + when(b.date) + "</time>" : "";
  }

  mounts.forEach(function (mount) {
    var name = mount.getAttribute("data-blocks");
    var base = mount.getAttribute("data-blocks-base") || "../content/";
    fetch(base + name + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (blocks) {
        if (!Array.isArray(blocks) || !blocks.length) return;   // nothing added yet: the page looks untouched
        var html = "";
        blocks.forEach(function (b) {
          var draw = render[b.type];
          if (!draw) return;
          if (b.heading) html += '<h3 class="blk__head">' + esc(b.heading) + "</h3>";
          html += draw(b);
        });
        if (!html) return;
        mount.innerHTML = html;
        mount.hidden = false;
      })
      .catch(function () { /* a missing file is the normal case */ });
  });
})();
