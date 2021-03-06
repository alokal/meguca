/*
 Core rendering object both on the client and server
 */

'use strict';

var imports = require('./imports'),
	index = require('./index'),
	util = require('./util');

const config = imports.config,
	escape = util.escape_html,
	flatten = util.flatten,
	join = util.join,
	new_tab_link = util.new_tab_link,
	pad = util.pad,
	parseHTML = util.parseHTML,
	safe = util.safe;

var OneeSama = function(t) {
	this.tamashii = t;
	this.hooks = {};
};
module.exports = OneeSama;

var OS = OneeSama.prototype;

var break_re = new RegExp("(\\S{" + index.WORD_LENGTH_LIMIT + "})");

// Internal refs, embeds
var ref_re = '>>(\\d+';
ref_re += '|>\\/watch\\?v=[\\w-]{11}(?:#t=[\\dhms]{1,9})?';
ref_re += '|>\\/soundcloud\\/[\\w-]{1,40}\\/[\\w-]{1,80}';
ref_re += '|>\\/pastebin\\/\\w+';

for (var i = 0; i < config.BOARDS.length; i++) {
	ref_re += '|>\\/' + config.BOARDS[i] + '\\/(?:\\d+)?';
}

ref_re += ')';
ref_re = new RegExp(ref_re);

OS.hook = function(name, func) {
	var hs = this.hooks[name];
	if (!hs)
		this.hooks[name] = [func];
	else if (hs.indexOf(func) < 0)
		hs.push(func);
};

OS.trigger = function(name, param) {
	var hs = this.hooks[name];
	if (hs)
		for (var i = 0; i < hs.length; i++)
			hs[i].call(this, param);
};

/*
 * Language mappings and settings. Overriden by cookie server-side and
 * bootstraped into the template client-side
 */
OS.lang = imports.isNode ? imports.lang[config.DEFAULT_LANG].common
	: imports.lang;

OS.red_string = function(ref) {
	var dest, linkClass;
	if (/^>\/watch/.test(ref)) {
		dest = 'https://www.youtube.com/' + ref.slice(2);
		linkClass = 'embed watch';
	}
	else if (/^>\/soundcloud/.test(ref)) {
		dest = 'https://soundcloud.com/' + ref.slice(13);
		linkClass = 'embed soundcloud';
	}
	else if (/^>\/pastebin/.test(ref)) {
		dest = 'https://pastebin.com/' + ref.slice(11);
		linkClass = 'embed pastebin';
	}

	// Linkify >>>/board/ URLs
	for (let i = 0, len = config.BOARDS.length; i < len; i++) {
		let board = config.BOARDS[i];
		if (!new RegExp('^>\\/' + board + '\\/').test(ref))
			continue;
		dest = '../' + board;
		linkClass = '';
		break;
	}

	if (!dest) {
		this.tamashii(parseInt(ref, 10));
		return;
	}
	this.callback(new_tab_link(encodeURI(dest), '>>' + ref, linkClass));
};

OS.break_heart = function(frag) {
	if (frag.safe)
		return this.callback(frag);
	let bits = frag.split(break_re);
	for (let i = 0, len = bits.length; i < len; i++) {
		/* anchor refs */
		const morsels = bits[i].split(ref_re);
		for (let j = 0, len = morsels.length; j < len; j++) {
			const m = morsels[j];
			if (j % 2)
				this.red_string(m);
			else if (i % 2) {
				this.geimu(m);
				this.callback(safe('<wbr>'));
			}
			else
				this.geimu(m);
		}
	}
};

OS.iku = function(token, to) {
	let state = this.state;
	if (state[0] == index.S_QUOTE && to != index.S_QUOTE)
		this.callback(safe('</em>'));
	switch(to) {
		case index.S_QUOTE:
			if (state[0] != index.S_QUOTE) {
				this.callback(safe('<em>'));
				state[0] = index.S_QUOTE;
			}
			this.break_heart(token);
			break;
		case index.S_SPOIL:
			if (token[1] == '/') {
				state[1]--;
				this.callback(safe('</del>'));
			}
			else {
				const del = {html: '<del>'};
				this.trigger('spoilerTag', del);
				this.callback(safe(del.html));
				state[1]++;
			}
			break;
		default:
			this.break_heart(token);
			break;
	}
	state[0] = to;
};

OS.fragment = function(frag) {
	const chunks = frag.split(/(\[\/?spoiler])/i);
	let state = this.state;
	const	q = state[0] === index.S_QUOTE;
	for (let i = 0, len = chunks.length; i < len; i++) {
		let chunk = chunks[i];
		if (i % 2) {
			let to = index.S_SPOIL;
			if (chunk[1] == '/' && state[1] < 1)
				to = q ? index.S_QUOTE : index.S_NORMAL;
			this.iku(chunk, to);
			continue;
		}
		const lines = chunk.split(/(\n)/);
		for (let o = 0, len = lines.length; o < len; o++) {
			const line = lines[o];
			if (o % 2)
				this.iku(safe('<br>'), index.S_BOL);
			else if (state[0] === index.S_BOL && line[0] == '>')
				this.iku(line, index.S_QUOTE);
			else if (line)
				this.iku(line, q ? index.S_QUOTE : index.S_NORMAL);
		}
	}
};

OS.karada = function(body) {
	var output = [];
	this.state = [index.S_BOL, 0];
	this.callback = function(frag) {
		output.push(frag);
	};
	this.fragment(body);
	this.callback = null;
	if (this.state[0] == index.S_QUOTE)
		output.push(safe('</em>'));
	for (let i = 0; i < this.state[1]; i++)
		output.push(safe('</del>'));
	return output;
};

OS.geimu = function(text) {
	if (!this.dice) {
		this.eLinkify ? this.linkify(text) : this.callback(text);
		return;
	}

	const bits = text.split(util.dice_re);
	for (let i = 0, len = bits.length; i < len; i++) {
		const bit = bits[i];
		if (!(i % 2) || !util.parse_dice(bit))
			this.eLinkify ? this.linkify(bit) : this.callback(bit);
		else if (this.queueRoll)
			this.queueRoll(bit);
		else if (!this.dice[0])
			this.eLinkify ? this.linkify(bit) : this.callback(bit);
		else {
			let d = this.dice.shift();
			this.callback(safe('<strong>'));
			this.strong = true; // for client DOM insertion
			this.callback(util.readable_dice(bit, d));
			this.strong = false;
			this.callback(safe('</strong>'));
		}
	}
};

OS.linkify = function(text) {

	let bits = text.split(/(https?:\/\/[^\s"<>]*[^\s"<>'.,!?:;])/);
	for (let i = 0, len = bits.length; i < len; i++) {
		if (i % 2) {
			const e = util.escape_html(bits[i]);
			// open in new tab, and disavow target
			this.callback(safe(
				`<a href="${e}" rel="nofollow" target="_blank">${e}</a>`
			));
		}
		else
			this.callback(bits[i]);
	}
};

// Central image rendering method
OS.gazou = function(data, reveal) {
	return [
		safe('<figure>'),
		this.figcaption(data, reveal),
		(this.thumbStyle !== 'hide' || reveal) && safe(this.thumbnail(data)),
		safe('</figure>')
	];
};

// Render image header
OS.figcaption = function(data, reveal) {
	let html = parseHTML
		`<figcaption>
			${this.thumbStyle === 'hide'
				&& `<a class="imageToggle">
					[${this.lang[reveal ? 'hide' : 'show']}]
				</a>`
			}
			${this.imageSearch(data)}
			<i>
				(${data.audio && '\u266B, '}
				${data.length && (data.length + ', ')}
				${util.readable_filesize(data.size)},
				${data.dims[0]}x${data.dims[1]}
				${data.apng && ', APNG'})~`;
	// No user-input data. No need to escape.
	html = [safe(html)];
	html.push(this.imageLink(data), safe('</i></figcaption>'));

	return html;
};

// Generate the static part of image search links
const searchBase = (function() {
	const models = [
		{
			class: 'google',
			url: 'https://www.google.com/searchbyimage?image_url=',
			type: 'thumb',
			symbol: 'G'
		},
		{
			class: 'iqdb',
			url: 'http://iqdb.org/?url=',
			type: 'thumb',
			noSSL: true,
			symbol: 'Iq'
		},
		{
			class: 'saucenao',
			url: 'http://saucenao.com/search.php?db=999&url=',
			type: 'thumb',
			noSSL: true,
			symbol: 'Sn'
		},
		{
			class: 'foolz',
			type: 'MD5',
			url: 'http://archive.moe/_/search/image/',
			symbol: 'Fz'
		},
		{
			class: 'exhentai',
			type: 'SHA1',
			url: 'http://exhentai.org/?fs_similar=1&fs_exp=1&f_shash=',
			symbol: 'Ex'
		}
	];

	let base = [];
	for (let i = 0, l = models.length; i < l; i++) {
		let model = models[i];
		base[i] = [
			parseHTML
				`<a target="_blank"
		 			rel="nofollow"
		 			class="imageSearch ${model.class}"
		 			href="${model.url}`,
			model.type,
			parseHTML
				`${model.ssl && '?ssl=off'}"
				>
				${model.symbol}
				</a>`
		];
	}
	return base;
})();

OS.imageSearch = function(data) {
	let html = '';
	const base = searchBase,
		// Only use HTTP for thumbnail image search, because IQDB and
		// Saucenao can't into certain SSL cyphers
		imageURl = this.thumbPath(data).replace(/^https/, 'http');
	for (let i = 0, l = base.length; i < l; i++) {
		let parts = base[i];
		html += parts[0]
			+ encodeURI(parts[1] !== 'thumb' ?  data[parts[1]] : imageURl)
			+ parts[2];
		// Only render google for PDFs and MP3s
		if (i === 0 && ['.pdf', '.mp3'].indexOf(data.ext) > -1)
			break;
	}

	return html;
};

// Get thumbnail path, even if no thumbnail generated
OS.thumbPath = function(data, mid) {
	let type = 'thumb';
	if (mid && data.mid)
		type = 'mid';
	else if (!data.thumb)
		type = 'src';

	return this.imagePaths()[type] + data[type];
};

OS.imageLink = function(data) {
	let name = '',
		imgnm = data.imgnm;
	const m = imgnm.match(/^(.*)\.\w{3,4}$/);
	if (m)
		name = m[1];
	let html = [
		safe(parseHTML
			`<a href="${config.SECONDARY_MEDIA_URL}src/${data.src}"
				rel="nofollow"
				download="`
		),
		imgnm
	];
	if (name.length >= 38) {
		html.push(safe('" title="'), imgnm);
		imgnm = [name.slice(0, 30), safe('(&hellip;)'), data.ext];
	}
	html.push(safe('">'), imgnm, safe('</a>'));

	return html;
};

OS.imagePaths = function() {
	if (!this._imgPaths) {
		const mediaURL = config.MEDIA_URL;
		this._imgPaths = {
			src: mediaURL + 'src/',
			thumb: mediaURL + 'thumb/',
			mid: mediaURL + 'mid/',
			spoil: mediaURL + 'spoil/spoiler'
		};
		this.trigger('mediaPaths', this._imgPaths);
	}
	return this._imgPaths;
};

OS.thumbnail = function(data, href) {
	const paths = this.imagePaths(),
		dims = data.dims;
	let src = paths.src + (data.src),
		thumb,
		width = dims[0],
		height = dims[1],
		thumbWidth = dims[2],
		thumbHeight = dims[3];

	// Spoilered and spoilers enabled
	if (data.spoiler && this.spoilToggle) {
		let sp = this.spoilerInfo(data);
		thumb = sp.thumb;
		thumbWidth = sp.dims[0];
		thumbHeight = sp.dims[1];
	}
	// Animated GIF thumbnails
	else if (data.ext === '.gif' && this.autoGif)
		thumb = src;
	else
		thumb = this.thumbPath(data, this.thumbStyle === 'sharp');

	// Source image smaller than thumbnail and other fallbacks
	if (!thumbWidth) {
		thumbWidth = width;
		thumbHeight = height;
	}

	// Thumbnails on catalog pages do not need hover previews. Adding the
	// `expanded` class excludes them from the hover handler.
	return parseHTML
		`${config.IMAGE_HATS && '<span class="hat"></span>'}
		<a target="blank" rel="nofollow" href="${href || src}">
			<img src="${thumb}"
				width="${thumbWidth}
				height=${thumbHeight}"
				${href && 'class="expanded"'}
			>
		</a>`
};

OS.spoilerInfo = function(data) {
	let highDef = data.large || this.thumbStyle !== 'small';
	return {
		thumb: parseHTML
			`${this.imagePaths().spoil}${highDef && 's'}${data.spoiler}.png`,
		dims: data.large ? config.THUMB_DIMENSIONS : config.PINKY_DIMENSIONS
	};
};

OS.post_url = function(num, op) {
	op = op || num;
	return `${this.op == op ? '' : op}#${num}`;
};

OS.post_ref = function(num, op, desc_html) {
	var ref = '&gt;&gt;' + num;
	if (desc_html)
		ref += ' ' + desc_html;
	else if (this.op && this.op != op)
		ref += ' \u2192';
	else if (num == op && this.op == op)
		ref += ' (OP)';
	return safe(
		`<a href="${this.post_url(num, op)}" class="history">${ref}</a>`
	);
};

OS.post_nav = function(post) {
	const num = post.num,
		op = post.op;
	return parseHTML
		`<nav>
			<a href="${this.post_url(num, op)}" class="history">
				No.
			</a>
			<a href="${this.post_url(num, op)}" class="quote">
				${num}
			</a>
		</nav>`;
};

OS.expansion_links_html = function(num) {
	return parseHTML
		`<span class="act expansionLinks">
			<a href="${num}" class="history">
				${this.lang.expand}
			</a>
			] [
			<a href="${num}?last=${this.lastN}" class="history">
				${this.lang.last} ${this.lastN}
			</a>
		</span>`;
};

OS.atama = function(data) {
	let html = parseHTML
		`<header>
			<span class=control></span>
			${data.subject && `<h3>「${escape(data.subject)}」</h3>`}
			${this.name(data)}~
			${this.time(data.time)}~
			${this.post_nav(data)}
			${!this.full && !data.op && this.expansion_links_html(data.num)}
		</header>\n\t`

	// TODO: Revisit, when we get to moderation.
	/*
	this.trigger('headerFinish', {
		header,
		data
	});
	*/
	return [safe(html)];
};

OS.name = function(data) {
	let html = '';
	const auth = data.auth,
		email = data.email;
	html += parseHTML`<b class="name${auth && ` ${auth.toLowerCase()}`}">`;
	if (email) {
		html += parseHTML
			`<a class="email"
				href="mailto:${encodeURI(email)}"
				target="_blank"
			>`
	}
	html += this.resolveName(data);
	if (email)
		html += '</a>';
	html += '</b>'
	return html;
	// TODO: Refactor, when moderation implemented
	/*this.trigger('headerName', {
		header: html,
		data
	});*/
};

OS.resolveName = function(data) {
	let html = '';
	const trip = data.trip,
		name = data.name,
		auth = data.auth;
	if (name || !trip) {
		if (name)
			html += escape(data.name);
		else
			html += this.lang.anon;
		if(trip)
			html += ' ';
	}
	if (trip)
		html += `<code>'${escape(trip)}</code>`;
	if (auth) {
		const hot = imports.hotConfig;
		html += ` ## ${auth === 'Admin' ? hot.ADMIN_ALIAS : hot.MOD_ALIAS}`;
	}
	return html;
};

OS.time = function(time) {
	// Format according to client's relative post timestamp setting
	let title, text;
	const readable = this.readable_time(time);
	if (this.rTime) {
		title = readable;
		text = this.relative_time(time, Date.now());
	}
	return parseHTML
		`<time datetime="${this.datetime(time)}" title="${title}">
			${text || readable}
		</time>`;
};

// For dealing with timezone diferences
OS.datetime = function(time) {
	let d = new Date(time);
	return (d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-'
	+ pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':'
	+ pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + 'Z');
};

OS.readable_time = function(time) {
	var h = this.tz_offset;
	var offset;
	if (h || h == 0)
		offset = h * 60 * 60 * 1000;
	else
	// XXX: would be nice not to construct new Dates all the time
		offset = new Date().getTimezoneOffset() * -60 * 1000;
	var d = new Date(time + offset);

	return parseHTML
		`${pad(d.getUTCDate())} ${this.lang.year[d.getUTCMonth()]}
		${d.getUTCFullYear()}(${this.lang.week[d.getUTCDay()]})
		${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

// Readable elapsed time since post
OS.relative_time = function(then, now) {
	let time = Math.floor((now - then) / 60000);
	if (time < 1)
		return this.lang.just_now;

	const divide = [60, 24, 30, 12],
		unit = ['minute', 'hour', 'day', 'month'];
	for (let i = 0, len = divide.length; i < len; i++) {
		if (time < divide[i])
			return this.lang.ago(time, this.lang['unit_' + unit[i]]);
		time = Math.floor(time / divide[i]);
	}

	return this.lang.ago(time, this.lang.unit_year);
};

OS.monogatari = function(data) {
	var tale = {header: this.atama(data)};
	this.dice = data.dice;
	var body = this.karada(data.body);
	tale.body = [
		safe('<blockquote>'),
		body,
		safe('</blockquote><small></small>')
	];
	if (data.image && !data.hideimg) {
		// Larger thumbnails for thread images
		data.image.large = !data.op;
		tale.image = this.gazou(data.image);
	}

	return tale;
};

OS.mono = function(data) {
	var info = {
		data: data,
		classes: data.editing ? ['editing'] : [],
		style: ''
	};
	this.trigger('openArticle', info);
	var cls = info.classes.length && info.classes.join(' '),
		o = safe('\t<article id="' + data.num + '"' +
			(cls ? ' class="' + cls + '"' : '') +
			(info.style ? ' style="' + info.style + '"' : '') +
			'>'),
		c = safe('</article>\n'),
		gen = this.monogatari(data);

	return join([o, gen.header, gen.image || '', gen.body, c]);
};

OS.monomono = function(data, cls) {
	if (data.locked)
		cls = cls ? cls + ' locked' : 'locked';
	var o = safe(`<section id="${data.num}"`
			+ (cls ? ` class="${cls}"` : '') + '>'),
		c = safe('</section>\n'),
		gen = this.monogatari(data);
	return flatten([o, gen.image || '', gen.header, gen.body, '\n', c]);
};

OS.asideLink = function(inner, href, cls, innerCls) {
	return parseHTML
		`<aside class="act ${cls}">
			<a~
				${href && `href="${href}"`}
				${innerCls && ` class="${innerCls}"`}
			>
				${this.lang[inner] || inner}
			</a>
		</aside>`
};

OS.replyBox = function() {
	return this.asideLink('reply', null, 'posting');
};

OS.newThreadBox = function() {
	return this.asideLink('newThread', null, 'posting');
};
