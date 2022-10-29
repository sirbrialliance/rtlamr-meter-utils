const child_process = require('child_process');
const { stringify } = require('querystring');

var sqlite3 = require('sqlite3').verbose();

var config = require("./config");


var db = new sqlite3.Database('meterData.sqlite');

var rtlPath = 'C:/Users/Jon/bin/rtl-sdr-release/x64';
var amrPath = 'C:/Users/Jon/go/bin';


db.serialize(function() {
	db.run("CREATE TABLE IF NOT EXISTS meterPackets (dateTime TEXT, meterId INT, type INT, consumption INT)");
	db.run("CREATE TABLE IF NOT EXISTS netIdmPackets (dateTime TEXT, meterId INT, idmType INT, data TEXT)");
});

console.log("Starting SDR...");

var tcpProc = child_process.exec("rtl_tcp", {
	cwd: config.rtlPath || "",
});

tcpProc.on('error', (error) => {
	throw error;
});
tcpProc.stdout.on('data', (data) => {
	console.log("RTL: ", data);
});
tcpProc.stderr.on('data', (data) => {
	console.log("RTL-> ", data);
});


setTimeout(() => {
	console.log("Starting amr");


	var amrProc = child_process.exec((config.amrPath + "/" || "") + "rtlamr -msgtype=scm,scm+,idm,netidm -format=json", {
		//cwd: config.amrPath || ""
	}, (a, b, err) => {
		if (err) throw err;
	});

	amrProc.on('error', (error) => {
		throw error;
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
}, 1000);



function handleData(line) {
	/* For my net meter I get: (formatted)
		{"Time":"2022-10-28T16:06:13.452584175-06:00","Offset":0,"Length":0,"Type":"SCM+","Message":{
			"FrameSync":5795,"ProtocolID":30,"EndpointType":8,"EndpointID":1XXXXXXXX4,"Consumption":44,"Tamper":257,"PacketCRC":XXXXX
		}}
		{"Time":"2022-10-28T16:06:13.870720851-06:00","Offset":0,"Length":0,"Type":"SCM+","Message":{
			"FrameSync":5795,"ProtocolID":30,"EndpointType":8,"EndpointID":1XXXXXXXX5,"Consumption":670,"Tamper":0,"PacketCRC":XXXXX
		}}
		{"Time":"2022-10-28T16:06:14.392190473-06:00","Offset":0,"Length":0,"Type":"SCM+","Message":{
			"FrameSync":5795,"ProtocolID":30,"EndpointType":8,"EndpointID":1XXXXXXXX6,"Consumption":9999374,"Tamper":257,"PacketCRC":XXXXX
		}}

		Consumption appears to be kWh * 10.
		First is power used, second is power exported, third appears to be used minus exported but negative numbers wrap from 9999999

		a={"Time":"2022-10-28T16:11:36.603634486-06:00","Offset":0,"Length":0,"Type":"IDM","Message":{
			"Preamble":1431639715,"PacketTypeID":28,"PacketLength":92,"HammingCode":198,"ApplicationVersion":4,
			"ERTType":8,"ERTSerialNumber":1XXXXXXXX4,
			"ConsumptionIntervalCount":32,"ModuleProgrammingState":95,
			"TamperCounters":"AQn/ARUF","AsynchronousCounters":0,"PowerOutageFlags":"AAAAAiwA",
			"LastConsumptionCount":43948180,
			"DifferentialConsumptionIntervals":[26,0,0,27,288,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,86,5,320],
			"TransmitTimeOffset":3853,"SerialNumberCRC":XXXX,"PacketCRC":XXXXX
		}}
		a={"Time":"2022-10-28T16:11:36.604299177-06:00","Offset":0,"Length":0,"Type":"NetIDM","Message":{
			"Preamble":1431639715,"ProtocolID":28,"PacketLength":92,"HammingCode":198,"ApplicationVersion":4,
			"ERTType":8,"ERTSerialNumber":1XXXXXXXX4,
			"ConsumptionIntervalCount":32,"ProgrammingState":95,"LastGeneration":670,"LastConsumption":44,"LastConsumptionNet":441,
			"DifferentialConsumptionIntervals":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,43,90],
			"TransmitTimeOffset":3853,"SerialNumberCRC":XXXX,"PacketCRC":XXXXX
		}}

		Normal SCM looks like
		{"Time":"2022-10-28T16:35:35.133348727-06:00","Offset":0,"Length":0,"Type":"SCM","Message":{
			"ID":XXXXXXXX,"Type":7,"TamperPhy":1,"TamperEnc":0,"Consumption":XXXXXXX,"ChecksumVal":XXXX
		}}

	*/

	var data;
	try {
		data = JSON.parse(line);
	} catch (e) {
		console.log("Unknown input: " + line);
		return;
	}

	var meterData, idmData;

	switch (data["Type"]) {
		case "SCM":
			meterData = {
				meterId: data["Message"]["ID"],
				type: data["Message"]["Type"],
				usage: data["Message"]["Consumption"],
			}
			break;
		case "SCM+":
			meterData = {
				meterId: data["Message"]["EndpointID"],
				type: data["Message"]["EndpointType"],
				usage: data["Message"]["Consumption"],
			}
			break;
		case "IDM":
		case "NetIDM":
			idmData = data["Message"];
			delete idmData["Preamble"];
			delete idmData["ApplicationVersion"];
			delete idmData["PacketTypeID"];
			delete idmData["ProtocolID"];
			delete idmData["PacketLength"];
			delete idmData["HammingCode"];
			delete idmData["SerialNumberCRC"];
			delete idmData["PacketCRC"];
			break;
		default:
			console.log("Unknown message: " + line);
			return;
	}

	if (meterData) {
		console.log("Usage:", JSON.stringify(meterData));

		db.serialize(function() {
			var stmt = db.prepare("INSERT INTO meterPackets (dateTime, meterId, type, consumption) VALUES (datetime('now'), ?, ?, ?)");
			stmt.run(meterData.meterId, meterData.type, meterData.usage);
			stmt.finalize();
		});
	} else if (idmData) {
		let json = JSON.stringify(idmData);
		let type = data["Type"] === "IDM" ? 1 : 2;
		console.log("IDM:", data["Type"], json);

		db.serialize(function() {
			var stmt = db.prepare("INSERT INTO netIdmPackets (dateTime, meterId, idmType, data) VALUES (datetime('now'), ?, ?, ?)");
			stmt.run(idmData["ERTSerialNumber"], type, json);
			stmt.finalize();
		});
	}
}


function stayAlive() {
	setTimeout(stayAlive, 1000);
}
stayAlive();

function finishIt() {
	// if (tcpProc) {
	// 	tcpProc.kill();
	// }
	// if (amrProc) {
	// 	amrProc.kill();
	// }
	if (db) {
		db.close();
		db = null;
	}
}

process.on('exit', finishIt.bind(null, {cleanup:true}));
process.on('SIGINT', finishIt.bind(null, {exit:true}));
