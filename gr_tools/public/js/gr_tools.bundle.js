import './controls/multicheck_single';
import './utils/payment_entry_quick_entry';

if (frappe.realtime && !frappe.realtime.socket && !frappe.boot.disable_async) {
	frappe.realtime.init(undefined, true);

	const socket = frappe.realtime.socket;
	socket.io.opts.transports = ['websocket', 'polling'];
	socket.on('connect_error', () => {
		if (!socket.io.engine?.id && socket.io.opts.transports[0] === 'websocket') {
			socket.io.opts.transports = ['polling', 'websocket'];
		}
	});

	frappe.realtime.connect();
}
