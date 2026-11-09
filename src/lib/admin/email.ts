/**
 * "Your Wrapped is ready" email for an admin to paste into their mail client.
 *
 * Mail clients keep tables and inline styles, so that's all this uses. Images are absolute
 * URLs to this server's public /email/* files (static/email): pasted emails can't carry
 * attachments, and most clients block data: URIs. Recipients only see the images if this
 * server is reachable from the internet, so a LAN/localhost origin degrades to alt text.
 */

export interface WrappedEmail {
	subject: string;
	html: string;
	text: string;
}

export interface EmailInput {
	name: string; // recipient (Jellyfin user name)
	year: number;
	url: string; // their share link
	origin: string; // public origin of this server, for image URLs
	from?: string | null; // admin's name for the sign-off
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = '#1a0a4a';
const BODY = '#3d3552';
const SOFT = '#7a7290';

/** True when people outside this network couldn't load the email's images. */
export function isPrivateOrigin(origin: string): boolean {
	try {
		const h = new URL(origin).hostname;
		return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(h) || h.endsWith('.local') || h.endsWith('.lan') || !h.includes('.');
	} catch {
		return true;
	}
}

export function wrappedEmail({ name, year, url, origin, from }: EmailInput): WrappedEmail {
	const img = (file: string) => `${origin.replace(/\/$/, '')}/email/${file}`;
	const subject = `Your ${year} Wrapped is ready 🎬`;
	const n = esc(name);
	const u = esc(url);

	const feature = (icon: string, title: string) => `
		<td align="center" valign="top" width="33%" style="padding:0 6px;">
			<img src="${img(icon)}" width="56" height="56" alt="" style="display:block;border:0;width:56px;height:56px;margin:0 auto 10px;">
			<div style="font-family:${FONT};font-size:14px;line-height:19px;font-weight:600;color:${INK};">${title}</div>
		</td>`;

	const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f4f1fa;">
<tr><td align="center" style="padding:24px 12px;">
	<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:separate;width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
		<tr><td style="padding:0;line-height:0;">
			<a href="${u}" style="text-decoration:none;"><img src="${img('banner.jpg')}" width="600" alt="Your year on screen, Wrapped" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px 18px 0 0;background:#1a0a4a;color:#ffffff;font-family:${FONT};font-size:22px;line-height:28px;"></a>
		</td></tr>
		<tr><td style="padding:36px 40px 8px;font-family:${FONT};">
			<p style="margin:0 0 6px;font-size:16px;line-height:24px;color:${SOFT};">Hi ${n},</p>
			<h1 style="margin:0 0 16px;font-size:30px;line-height:36px;font-weight:800;color:${INK};letter-spacing:-0.5px;">Your ${year} Wrapped is ready</h1>
			<p style="margin:0 0 28px;font-size:16px;line-height:25px;color:${BODY};">Your year in movies and shows: top picks, your biggest binge and a few surprises.</p>
			<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 32px;">
				<tr><td align="center" bgcolor="#c6f432" style="border-radius:999px;background:#c6f432;">
					<a href="${u}" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:17px;line-height:20px;font-weight:800;color:${INK};text-decoration:none;border-radius:999px;">▶&nbsp;&nbsp;Unwrap my ${year}</a>
				</td></tr>
			</table>
		</td></tr>
		<tr><td style="padding:0 34px 30px;">
			<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f7f5fc;border-radius:14px;">
				<tr><td style="padding:22px 6px 20px;">
					<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr>
						${feature('icon-titles.png', 'Your top shows<br>&amp; movies')}
						${feature('icon-personality.png', 'Your watching<br>personality')}
						${feature('icon-soundtrack.png', 'A soundtrack<br>from your year')}
					</tr></table>
				</td></tr>
			</table>
		</td></tr>
		<tr><td style="padding:0 40px 34px;font-family:${FONT};">
			<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:${BODY};">🔊 Best with sound on.</p>
			<p style="margin:0 0 22px;font-size:15px;line-height:23px;color:${BODY};">Happy watching!${from ? `<br>${esc(from)}` : ''}</p>
			<p style="margin:0;padding-top:18px;border-top:1px solid #ece8f4;font-size:12px;line-height:18px;color:${SOFT};">Or open <a href="${u}" style="color:${SOFT};">${u}</a></p>
		</td></tr>
	</table>
</td></tr>
</table>`;

	const text = [
		`Hi ${name},`,
		'',
		`Your ${year} Wrapped is ready!`,
		'',
		'Your year in movies and shows: top picks, your biggest binge and a few surprises.',
		'',
		`Unwrap it: ${url}`,
		'',
		'Best with sound on.',
		'',
		`Happy watching!${from ? `\n${from}` : ''}`
	].join('\n');

	return { subject, html, text };
}

/** Put rich HTML (with a plain-text alternative) on the clipboard. */
export async function copyRich(html: string, text: string): Promise<void> {
	try {
		await navigator.clipboard.write([
			new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })
		]);
		return;
	} catch {
		// no async Clipboard API (e.g. plain http on the LAN): the legacy copy event still works
	}
	const onCopy = (e: ClipboardEvent) => {
		e.clipboardData?.setData('text/html', html);
		e.clipboardData?.setData('text/plain', text);
		e.preventDefault();
	};
	document.addEventListener('copy', onCopy);
	try {
		if (!document.execCommand('copy')) throw new Error('Copy was blocked by the browser');
	} finally {
		document.removeEventListener('copy', onCopy);
	}
}
