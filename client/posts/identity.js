/*
 Name, email, tripcode and staff title persistence and postform propagation
 */

let main = require('../main'),
	{$, $email, $name, _, common} = main;

function load() {
	try {
		const id = JSON.parse(localStorage.ident);
		if (id.name)
			$name.val(id.name);
		if (id.email)
			$email.val(id.email);
	}
	catch(e) {}
}

let save = _.debounce(function() {
	try {
		const name = $name.val();
		var email = $email.val();
		// Staff login method
		if (email == 'misaki') {
			$email.val('');
			$('<scriptt/>', {
				src: main.config.MEDIA_URL + 'js/login.js?v=2'
			}).appendTo('head');
			email = false;
		}
		else if (common.is_sage(email) && !common.is_noko(email))
			email = false;
		var id = {};
		if (name || email) {
			if (name)
				id.name = name;
			if (email)
				id.email = email;
			localStorage.ident = JSON.stringify(id);
		}
		else
			localStorage.removeItem('ident');
	}
	catch(e) {}
}, 1000);

// Sync persistance and postForm with input changes
function propagate() {
	let postForm = main.request('postForm');
	if (postForm)
		postForm.renderIdentity();
	save();
}

main.defer(function() {
	load();
	$name.on('input', propagate);
	$email.on('input', propagate);
});
