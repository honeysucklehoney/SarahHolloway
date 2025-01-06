/*
 *                 .--.
 *               .'_\/_'.
 *               '. /\ .'
 *                 "||"
 *                  || /\
 *               /\ ||//\)
 *              (/\\||/
 *           ______\||/_______
 *
 */
// constants for cache expiration
const CACHE_NAME = 'switcher-cache';
const MAX_CACHE_AGE = 2 * 24 * 60 * 60 * 1000;  // 2 days in milliseconds

// Helper function to check if a cached response is older than the maximum cache age
function isCacheExpired(response) {
    const cacheTime = response.headers.get('sw-cache-time');
    if (!cacheTime) return true;  // No timestamp, treat as expired

    const cacheAge = Date.now() - new Date(cacheTime).getTime();
    return cacheAge > MAX_CACHE_AGE;  // Expired if older than 2 days
}

// Helper function to save to cache along with timestamp
function saveResponseInCache(url, response, cache) {
    // Create a new Response object with a custom header to store the current timestamp
    const headers = new Headers(response.headers);
    headers.append('sw-cache-time', new Date().toISOString());

    const responseWithTimestamp = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });

    console.log("++ storing url in cache: ", url);
    cache.put(url, responseWithTimestamp);  // Cache the response with timestamp
}


// function that prefetches any internal links on the current page which have not already been fetched
function prefetchLinks() {
    // Open the cache
    caches.open(CACHE_NAME).then(function (cache) {
        // Select all internal links (anchor tags starting with '/')
        const links = document.querySelectorAll('a[href^="/"]');

        links.forEach(function (link) {
            const url = link.href;  // Get the full URL of the link

            // Check if the URL is already in the cache
            cache.match(url).then(function (response) {
                if (!response || isCacheExpired(response)) {
                    // If not in cache, prefetch and store in cache
                    fetch(url).then(function (networkResponse) {
                        if (networkResponse.ok) {
                            saveResponseInCache(url, networkResponse.clone(), cache);  // Cache the response
                            console.log(`Prefetched and cached: ${url}`);
                        } else {
                            console.error(`Failed to fetch: ${url}`);
                        }
                    }).catch(function (error) {
                        console.error(`Fetch error: ${url}`, error);
                    });
                } else {
                    console.log(`Already cached: ${url}`);
                }
            }).catch(function (error) {
                console.error(`Cache match error: ${url}`, error);
            });
        });
    }).catch(function (error) {
        console.error('Cache open error:', error);
    });
}

// Function to add switcher click behavior to internal links
function attachLinkListeners(doc) {
    doc.querySelectorAll('a[href^="/"]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            event.preventDefault();  // Prevent default navigation

            const url = link.href;  // Get the URL from the clicked link

            // Check the cache first
            caches.open(CACHE_NAME).then(function (cache) {
                cache.match(url).then(function (cachedResponse) {
                    if (cachedResponse && !isCacheExpired(cachedResponse)) {
                        return cachedResponse.text();  // Use the cached response if it's not expired
                    } else {
                        // Fetch the content of the URL using AJAX
                        return fetch(url)
                            .then(networkResponse => {
                                if (!networkResponse.ok) {
                                    throw new Error('Network response was not ok');
                                    // this thrown error should get caught by the catch at the end
                                }
                                // also cache the response while we are here
                                saveResponseInCache(url, networkResponse.clone(), cache);
                                return networkResponse.text();  // Return the response as text (HTML)
                            });
                    }
                }).then(function (html) {
                    // Parse the returned HTML to extract the main content
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const newMainContent = doc.querySelector('main');  // Select the main content

                    if (newMainContent) {
                        // Replace the current main content with the fetched content
                        document.querySelector('main').innerHTML = newMainContent.innerHTML;

                        // update the URL in the browser
                        history.pushState({}, '', url);

                        // scroll to top of page
                        window.scrollTo(0, 0);

                        // Reapply the link behavior to newly added content and prefetch new pages
                        const main = document.querySelector('main');
                        activate_document(main);
                    } else {
                        // if there was no main section of the returned html, then fallback to default link behavior
                        window.location.href = url;
                    }
                })
                    .catch(error => {
                        console.error('Fetch error:', error);
                        // if there was an error in the ajax call, then fallback to default link behavior
                        window.location.href = url;
                    });
            });
        });
    });
}

// this line makes it so when you use the back button in non-chromium browsers, it refreshes the page
// in order to properly load the page
window.addEventListener('popstate', (event) => {
    window.location.href = window.location.href;
});

// activate function which is called on first page load, and after any page change
function activate_document(doc) {
    attachLinkListeners(doc);
    prefetchLinks();
}

// on first page load, activate the whole page
document.addEventListener('DOMContentLoaded', function () {
    activate_document(document);
});