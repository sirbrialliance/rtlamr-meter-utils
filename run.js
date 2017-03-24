const child_process = require('child_process');

var sqlite3 = require('sqlite3').verbose();


var db = new sqlite3.Database('meterData.sqlite');

var rtlPath = 'C:/Users/Jon/bin/rtl-sdr-release/x64';
var amrPath = 'C:/Users/Jon/go/bin';


db.serialize(function() {
	db.run("CREATE TABLE IF NOT EXISTS meterPackets (dateTime TEXT, meterId INT, type INT, consumption INT)");
});

console.log("Starting SDR...");

var tcpProc = child_process.exec("rtl_tcp", {
	cwd: rtlPath,
});

tcpProc.stdout.on('data', (data) => {
	console.log("RTL: ", data);
});
tcpProc.stderr.on('data', (data) => {
	console.log("RTL-> ", data);
});

console.log("Starting amr");

var amrProc = child_process.exec("rtlamr", {

	cwd: rtlPath,
});

amrProc.stdout.on('data', (data) => {
	data = data.toString();
	var parts = data.trim().split("\n");
	for (var i = 0; i < parts.length; i++) {
		let part = parts[i].trim();
		if (!part) continue;
		handleData(part);
	}
});

amrProc.stderr.on('data', (data) => {
	console.log("AMR-> ", data);
});

console.log("started");

function handleData(line) {
	// {Time:2017-03-24T14:41:38.637 SCM:{ID:12345678 Type: 7 Tamper:{Phy:00 Enc:00} Consumption: 1234567 CRC:0x1234}}
	var m = line.match(/SCM:\{ID:(\d+)\s*Type: (\d+) Tamper:{Phy:\d{2} Enc:\d{2}\} Consumption:\s*(\d+)\s+CRC:/);

	if (!m) {
		console.log("Unknown input: " + line);
		return;
	}

	var meterId = +m[1];
	var type = +m[2];
	var usage = +m[3];

	console.log("Meter " + meterId + ": " + usage + "");

	db.serialize(function() {
		var stmt = db.prepare("INSERT INTO meterPackets (dateTime, meterId, type, consumption) VALUES (datetime('now'), ?, ?, ?)");
		stmt.run(meterId, type, usage);
		stmt.finalize();
	});

}


function finishIt() {
	db.close();
}

process.on('exit', finishIt.bind(null, {cleanup:true}));
process.on('SIGINT', finishIt.bind(null, {exit:true}));
