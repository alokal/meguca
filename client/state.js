1/*
 * Central model keeping the state of the page
 */

let main = require('./main'),
	{$, Backbone, memory} = main;

// Read page state by parsing a URL
function read(url) {
	const href = url.split('#')[0];
	// Display last N posts setting on thread pages
	let lastN = href.match(/[\?&]last=(\d+)/),
		thread = href.match(/\/(\d+)(:?#\d+)?(?:[\?&]\w+=\w+)*$/),
		page = href.match(/\/page(\d+)$/);
	lastN = lastN ? parseInt(lastN[1], 10) : 0;
	thread = thread ? parseInt(thread[1], 10) : 0;
	page = page ? parseInt(page[1], 10) : -1;
	return {
		href,
		thread,
		page,
		lastN,
		board: href.match(/\/([a-zA-Z0-9]+?)\//)[1],
		catalog: /\/catalog/.test(href),
		/*
		 * Indicates if on the 'live' board page, which needs extra server-side
		 * logic.
		 */
		live: page === -1 && thread === 0
	};
}
exports.read = read;

// Initial page state
var page = exports.page = new Backbone.Model(read(location.href));

// Hot-reloadable configuration
// TODO: We need actual listeners to this model for hot reloads.
exports.hotConfig = new Backbone.Model(window.hotConfig);
// Hash of all the config variables
exports.configHash = window.configHash;

// Tracks the synchronisation counter of each thread
exports.syncs = {};
// Posts I made in this tab
exports.ownPosts = {};
// remember which posts are mine for two days
exports.mine = new memory('mine', 2);
// no cookie though
exports.mine.bake_cookie = function () { return false; };
$.cookie('mine', null); // TEMP

// All posts currently displayed
let posts = exports.posts = new Backbone.Collection();
main.on('state:clear', function() {
	/*
	 * Emptying the whole element should be faster than removing each post
	 * individually through models and listeners. Not that the `remove()`s
	 * don't fire anymore...
	 */
	main.$threads[0].innerHTML = '';
	const models = posts.models;
	for (let i = 0, l = models.length; i < l; i++) {
		// The <threads> tag has already been emptied, no need to perform
		// element removal with the default `.remove()` method
		models[i].dispatch('stopListening');
	}
	posts.reset();
	// Prevent old threads from syncing
	exports.syncs = {};
	main.command('massExpander:unset');
});

// Contains inter-post linking relations
exports.linkerCore = new Backbone.Model();

