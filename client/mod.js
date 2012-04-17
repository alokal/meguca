var $panel;
var $delPost, $delImage;

var nopeMsg = 'Nothing selected.';

function show_panel() {
	if ($panel)
		return;
	$delPost = $('<input type=button value=Delete>').click(korosu);
	$delImage = $('<input type=button value="Del Image">').click(korosu);
	$panel = $('<div></div>').append($delPost, '<br>', $delImage).css({
		position: 'fixed', bottom: '1em', right: '1em',
		"text-align": 'right'
	}).appendTo('body');
}

function korosu() {
	var ids = [];
	$('header>input').each(function () {
		var $check = $(this);
		if ($check.attr('checked')) {
			var id = $check.parent().parent().attr('id');
			ids.push(parseInt(id));
		}
	});
	var $button = $(this);
	if (ids.length) {
		var img = $button.is($delImage);
		ids.unshift(img ? 7 : 8);
		send(ids);
	}
	else {
		var orig = $button.val();
		var caption = _.bind($button.val, $button);
		caption(nopeMsg);
		if (orig != nopeMsg)
			_.delay(caption, 2000, orig);
	}
}

readOnly.push('graveyard');

window.fun = function () {
	send([12, THREAD]);
};

override(PF, 'make_alloc_request', function (orig, text) {
	var msg = orig.call(this, text);
	if ($('#authname').attr('checked'))
		msg.auth = AUTH;
	return msg;
});

$(document).click(function (event) {
	var $box = $(event.target);
	if ($box.attr('type') == 'checkbox' && $box.parent('header').length)
		show_panel();
});

$(function () {
	$('h1').text('Moderation - ' + $('h1').text());
	$('<input type=checkbox>').insertBefore('header>:first-child');
	$name.after(' <input type=checkbox id="authname">' +
			' <label for="authname">' + AUTH + '</label>');
	$email.after(' <form action="../logout" method=POST ' +
			'style="display: inline">' +
			'<input type=submit value=Logout></form>');

	oneeSama.hook('afterInsert', function (target) {
		$('<input type=checkbox>').insertBefore(target.find(
				'>header>:first-child'));
		return target;
	});
});
