const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer')
admin.initializeApp();

/**
 * @description return the custom claims Object
 * @param {Integer} type 
 */
function getCustomClaims (type) {
	switch (type) {
		case 1:
			// operator
			return {
				accessLevel: 3,
				admin: false
			};
		case 2:
			// client t0
			return {
				accessLevel: 5,
				admin: false
			}
		case 3:
			// client t1
			return {
				accessLevel: 6,
				admin: false
			}
		case 4: 
			// client t2
			return {
				accessLevel: 7,
				admin: false
			}
		case 5: 
			// admin
			return {
				accessLevel: 10,
				admin: true
			}
		default:
			// registrant
			return {
				accessLevel: 2,
				admin: false
			}
	}
}
/**
 * @description sign up API handle role base with firebase custom claims
 * recive { email: 'email@domain.com', password: '123456', displayName: 'test', type: 0 ... 5 }
 */
exports.signup = functions.https.onCall((param) => {
	const {email, password, displayName, type, domain} = param;
	return admin.auth().createUser({
		email: email,
		displayName: displayName,
		emailVerified: false,
		password: password,
		disabled: false
	})
	.then((userRecord) => {
		console.log("Successfully created new user " + displayName, userRecord.uid);
		const customClaims = getCustomClaims(type);
		if (type === 2) {
			admin.database().ref('domains/'+ userRecord.uid)
			.set({
				1: domain,
				2: '' //this will be the channel
			});
		}
		// Set custom user claims on this newly created user.
		return admin.auth().setCustomUserClaims(userRecord.uid, customClaims)
		.then(() => {
			// Update real-time database to notify client to force refresh.
			const metadataRef = admin.database().ref("metadata/" + userRecord.uid);
			// Set the refresh time to the current UTC timestamp.
			// This will be captured on the client to force a token refresh.
			return metadataRef.set({refreshTime: new Date().getTime()});
		})
		.catch(error => {
			console.log(error);
		});
	})
	.catch((error) => {
		console.log("Error creating new user:", error);
	});
})

exports.crateThread = functions.https.onCall((data, context) => {
	let { id, type, iniMsg, email, channel } = data;
	let from = 'CLIENT';
	let isNew = true;
	if (type === 'anonymous') {
		iniMsg = 'Welcome to Yak-chat, you can signup in your upper right corner';
		from = 'SERVER'
		admin
			.database()
			.ref("/clients/" + id + ":" + visitor + "/")
			.set(type + ',' + email);
	} else {
		admin.database().ref(`/clients/`)
		
		admin
			.database()
			.ref("/clients/"  + id + ":" + registrant + "/")
			.set(type + ',' + email);
	}
	admin
		.database()
		.ref('/messages/' + Buffer.from(channel + ':' + id).toString('base64'))
		.push()
		.set(
			new Date().toDateString() +
			',' + Buffer.from(iniMsg).toString('base64') +
			',' + from
		);
	return true;
})

var transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: 'no.reply.yak.chat@gmail.com',
		pass: 'r8NKJHxUxWi59LZ'
	}
});
/**
 * handle the send invitation email
 * @param {String} email 
 * @param {String} urlString 
 * @param {String} domain 
 */
function sendEmail(email, urlString, domain) {
	// 5. Send welcome email to new users
	console.log(process.env.EMAIL_USER, process.env.EMAIL_PASS)
	const mailOptions = {
			from: '<no.reply.yak.chat@gmail.com>',
			to: email,
			subject: 'Yak-chat has send you and invitation',
			html: `
				<div style="height: 100%; width: 100%; text-align: center;">
					<h2 style="color: #666666">We want you to become an Operator</h2>
					click <a href="${domain + urlString}"> here </a> to see the invitation
				</div>
			`
		}
	// 6. Process the sending of this email via nodemailer
	return transporter.sendMail(mailOptions, function (err, info) {
		if(err) {
			console.log(err)
			return false
		} else {
			console.log(info.response);
			return true;
		}
		});
}
/**
 * handle the invite operators by client, if email is provided send mail invitatio invitation 
 * return the link invitation
 */
exports.inviteOperator = functions.https.onCall((param) => {
	const { uuid, email, name } = param;
	const domain = 'http://localhost:8080';
	return admin.database().ref('/pendingusers/')
	.push({
		0: uuid,
		1: email ? email : '',
		2: name ? name : ''
	})
	.then(res => {
		const urlString = '/#/invite/?k=' + res.key + (email ? '&m=' + email : '') + (name ? '&n=' + name : '');
		if (email) {
			// dispatch email
			sendEmail(email, urlString, domain);
		}
		return domain + urlString
	})
	.catch(err => {
		console.error(err);
		return false;
	});
})

/**
 * 0 = text
 * 1 = action
 * 2 = url_change
 */
const _types = ['AA', 'AB', 'AC']

/**
 * 
 * @param {String} value 
 * @param {Int32Array} digis 
 */
function base64 (value, digis) {
	if ( typeof(value) === 'number') {
		if (digis) {
			return base64.getChars(value, '').padStart(digis,'A');
		} else {
			return base64.getChars(value, '');
		}
	}
	if (typeof(value) === 'string') {
		if (value === '') { return NaN; }
		return value.split('').reverse().reduce(function(prev, cur, i) {
			return prev + base64.chars.indexOf(cur) * Math.pow(64, i);
		}, 0);
	}
}
base64.chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
base64.getChars = function(num, res) {
	var mod = num % 64,
	remaining = Math.floor(num / 64),
	chars = base64.chars.charAt(mod) + res;
	if (remaining <= 0) { return chars; }
	return base64.getChars(remaining, chars);
};

exports.handleVisitor = functions.https.onRequest(async (req, resp) => {
	// the unique user id or the browser fingerprint
	const uid = req.query.u ? req.query.u : 'ddafb13befe7d0cbd978efa67a0a72b0';
	// we get the domain it come from by the headers
	const host = req.headers.host;
	console.log(host);
	const k = await admin
		.database()
		.ref("/domains/")
		.orderByChild('1')
		.equalTo(host)
		.once('value').then((res) => {
			const val = res.val()
			const key = Object.keys(val)[0]
			return key;
		});
	//get the last one
	const domain = admin.database().ref('/domains/' + k)
	domain
		.child('4/' + uid)
		.limitToLast(1)
		.once('value').then((res) => {
			console.log('who',res.val())
			if (!res.val()) {
				domain.child('4/' + uid)
				.set({0:''})
				.then(res => {
					console.log('me?',res);
				}).catch(err => {
					console.log(err);
				})
			}
		})
	resp.send(k);
})