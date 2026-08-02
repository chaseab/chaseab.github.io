/*!
=========================================================
* JohnDoe Landing page
=========================================================

* Copyright: 2019 DevCRUD (https://devcrud.com)
* Licensed: (https://devcrud.com/licenses)
* Coded by www.devcrud.com

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

// smooth scroll
$(document).ready(function(){
    $(".navbar .nav-link").on('click', function(event) {

        if (this.hash !== "") {

            event.preventDefault();

            var hash = this.hash;

            $('html, body').animate({
                scrollTop: $(hash).offset().top
            }, 700, function(){
                window.location.hash = hash;
            });
        } 
    });
    
    // Photography gallery: Isotope masonry with per-category batched lazy-loading.
    $(window).on("load", function() {
        var $container = $(".portfolio-container");
        var $seeMoreBtn = $("#photo-see-more");
        var BATCH_SIZE = 9;
        var currentFilter = ".new";
        var shownCounts = {};
        var revealLocked = false;
        var layoutTimer = null;

        // This Isotope build (v3.0.6) does NOT bundle imagesLoaded, so masonry
        // would otherwise measure item heights before the freshly-assigned images
        // have decoded (height 0) and cram every tile into a collapsed, overlapping
        // stack. We relayout once the images arrive instead. A trailing debounce
        // both coalesces the burst of load events from a batch and, crucially,
        // defers the relayout to a later task so it runs AFTER the browser has
        // painted the decoded images and their real heights can be measured.
        function scheduleLayout() {
            if (layoutTimer) { clearTimeout(layoutTimer); }
            layoutTimer = setTimeout(function() {
                layoutTimer = null;
                $container.isotope("layout");
            }, 120);
        }

        // Assign the real src to a batch's images (they ship with only data-src so
        // hidden categories never download) and relayout once each one loads.
        function loadImages($items) {
            $items.find("img[data-src]").each(function() {
                var img = this;
                $(img).on("load error", scheduleLayout);
                img.setAttribute("src", img.getAttribute("data-src"));
                img.removeAttribute("data-src");
                img.removeAttribute("loading"); // reveal now, don't defer this batch
            });
        }

        function itemsForFilter(filter) {
            return $container.children(filter);
        }

        function updateSeeMoreVisibility(filter) {
            var total = itemsForFilter(filter).length;
            var shown = shownCounts[filter] || 0;
            $seeMoreBtn.toggle(shown < total);
        }

        // Initialise Isotope lazily, on the first reveal, so it is created with
        // the first batch already matching the filter. Initialising against zero
        // matching items instead makes Isotope hide everything and the later
        // reveal transition never resolves (tiles stay at opacity 0).
        function applyFilter(filter) {
            if (!$container.data("isotope")) {
                $container.isotope({
                    itemSelector: ".col-lg-4:not(.grid-sizer)",
                    layoutMode: "masonry",
                    percentPosition: true,
                    masonry: { columnWidth: ".grid-sizer" },
                    transitionDuration: "0.4s",
                    filter: filter + ".gallery-visible"
                });
            } else {
                $container.isotope({ filter: filter + ".gallery-visible" });
            }
        }

        function revealNextBatch(filter) {
            var $all = itemsForFilter(filter);
            var shown = shownCounts[filter] || 0;
            var $next = $all.slice(shown, shown + BATCH_SIZE);
            if (!$next.length) {
                updateSeeMoreVisibility(filter);
                return;
            }

            loadImages($next);
            $next.addClass("gallery-visible");
            shownCounts[filter] = shown + $next.length;

            applyFilter(filter);
            updateSeeMoreVisibility(filter);
            scheduleLayout(); // safety relayout in case load events are missed
        }

        // First batch for the default (Travel) category. This creates the Isotope
        // instance (see applyFilter). percentPosition + the stable .grid-sizer
        // column keep the masonry columns aligned to the Bootstrap grid at every
        // breakpoint and for every category, regardless of which items are filtered
        // out. Isotope binds its own window-resize relayout automatically.
        revealNextBatch(currentFilter);

        $(".filters a").on("click", function(e) {
            e.preventDefault();
            var filter = $(this).attr("data-filter");
            if (filter === currentFilter) { return; }

            $(".filters .active").removeClass("active");
            $(this).addClass("active");
            currentFilter = filter;

            if (!shownCounts[filter]) {
                revealNextBatch(filter);
            } else {
                applyFilter(filter);
                updateSeeMoreVisibility(filter);
            }
        });

        // Lock briefly so a rapid double-click can't reveal two batches or race
        // the relayout; the lock clears after the reveal transition settles.
        $seeMoreBtn.on("click", function(e) {
            e.preventDefault();
            if (revealLocked) { return; }
            revealLocked = true;
            revealNextBatch(currentFilter);
            window.setTimeout(function() { revealLocked = false; }, 400);
        });
    });
});


