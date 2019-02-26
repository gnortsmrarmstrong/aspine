#!/usr/bin/node

// --------------- Parameters ----------------
const THREADS = 10;

// -------------------------------------------


// --------------- Includes ------------------
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const express = require('express');
const util = require('util');

// -------------------------------------------

// --------------- Exports -------------------
module.exports = {
	scrape_student: scrape_student
};

// -------------------------------------------

// --------------- Scraping ------------------
// Returns object of classes
async function scrape_student(username, password) {
	let scrapers = [];

	// Spawn schedule scraper
	scrapers[THREADS] = scrape_schedule(username, password, THREADS);

	// Spawn recent activity scraper
	scrapers[THREADS + 1] = scrape_recent(username, password, THREADS + 1);

	//Spawn class scrapers
	for(let i = 0; i < THREADS; i++) {
		scrapers[i] = scrape_class(username, password, i);

	}

	// Await on all class scrapers
	return {
		classes: (await Promise.all(scrapers.slice(0, -2))).filter(Boolean),
		schedule: await scrapers[THREADS],
		recent: await scrapers[THREADS + 1]
	}
}

// Returns object of recent activity
async function scrape_recent(username, password, i) {
	return new Promise(async function(resolve, reject) {
		let session = await scrape_login();
		let page = await submit_login(username, password, session.apache_token, session.session_id);
		log(i, "session", session);


		let $ = cheerio.load(await fetch_body("https://aspen.cpsd.us/aspen/studentRecentActivityWidget.do?preferences=%3C%3Fxml+version%3D%221.0%22+encoding%3D%22UTF-8%22%3F%3E%3Cpreference-set%3E%0A++%3Cpref+id%3D%22dateRange%22+type%3D%22int%22%3E3%3C%2Fpref%3E%0A%3C%2Fpreference-set%3E&rand=1551041157793", 
			{"credentials":"include",
				"headers":{
					"Cookie": "deploymentId=x2sis; JSESSIONID=" + session.session_id + "; _ga=GA1.3.481904573.1547755534; _ga=GA1.2.1668470472.1547906676; _gid=GA1.3.1525149286.1550969560",
					"DNT": "1",
					"Accept-Encoding": "gzip, deflate, br",
					"Accept-Language": "en-US,en",
					"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.12.0 Chrome/69.0.3497.128 Safari/537.36",
					"Accept": "application/xml, text/xml, */*; q=0.01",
					"Referer": "https://aspen.cpsd.us/aspen/home.do",
					"X-Requested-With": "XMLHttpRequest",
					"Connection": "keep-alive",
					"X-Do-Not-Track": "1"
				},
				"referrer":"https://aspen.cpsd.us/aspen/home.do",
				"referrerPolicy":"strict-origin-when-cross-origin",
				"body":null,
				"method":"GET",
				"mode":"cors"}), {
				xmlMode: true,
				normalizeWhitespace: true,
				decodeEntities: true});
		log(i, "scrape recent widget", $);

		let studentName = $('recent-activity').attr('studentname');
		let recentAttendanceArray = [];
		let recentActivityArray = [];

		$('recent-activity').children().filter('periodAttendance')
		.each(function(i, elem) {
			recentAttendanceArray.push({
				date: $(this).attr('date'),
				period: $(this).attr('period'),
				code: $(this).attr('code'),
				classname: $(this).attr('classname'),
				dismissed: $(this).attr('dismissed'),
				absent: $(this).attr('absent'),
				excused: $(this).attr('excused'),
				tardy: $(this).attr('tardy'),
			});
		});
		log(i, "recentAttendance", recentAttendanceArray);
		

		$('recent-activity').children().filter('gradebookScore')
		.each(function(i, elem) {
			recentActivityArray.push({
				date: $(this).attr('date'),
				classname: $(this).attr('classname'),
				score: $(this).attr('grade'),
				assignment: $(this).attr('assignmentname'),
			});
		});
		log(i, "recentGrades", recentActivityArray);


		log(i, "closing");
		resolve({
			recentAttendanceArray,
			recentActivityArray,
			studentName,
		});
	});
}

// Returns promise that contains object of all class data
function scrape_class(username, password, i) {
	return new Promise(async function(resolve, reject) {
		// Login
		let session = await scrape_login();
		await submit_login(username, password,
			session.apache_token, session.session_id);
		log(i, "session", session);

		// Academics Page
		let academics = await scrape_academics(session.session_id);
		log(i, "academics", academics);

		// Check if thread is extra
		if(academics.classes[i] == undefined) {
			resolve(undefined);
			log(i, "closing");
			return;
		}

		// Get general class data 
		let categories = await scrape_details(session.session_id,
			academics.apache_token, academics.classes[i].id,
			academics.oid);
		log(i, "categories", categories);

		// Get assignments data page by page
		let assignments = await scrape_assignments(session.session_id, academics.apache_token);
		log(i, "assignments", assignments);

		// Return promise
		log(i, "closing");
		resolve({"name": academics.classes[i].name,
			"grade": academics.classes[i].grade,
			"categories": categories,
			"assignments": assignments});
	});
}

// Returns object with apache_token and session_id
async function scrape_login(username, password) {
	let page = await fetch_body("https://aspen.cpsd.us/aspen/logon.do",
		{"credentials":"include",
			"headers":{},
			"referrer":"https://aspen.cpsd.us/aspen/logon.do",
			"referrerPolicy":"strict-origin-when-cross-origin",
			"body":null,
			"method":"GET",
			"mode":"cors"});
	const session_id = page.substr(page.indexOf("jsessionid=") + "jsessionid=".length, 32);
	const apache_token = page.substr(page.indexOf("TOKEN\" value=\"") + "TOKEN\" value=\"".length, 32);
	return {"session_id": session_id, "apache_token": apache_token};
}

// Submits login with creds and session
async function submit_login(username, password, apache_token, session_id) {
	let page = await fetch_body("https://aspen.cpsd.us/aspen/logon.do",
		{"credentials":"include",
			"headers":{"Origin" : "https://aspen.cpsd.us",
				"Accept-Encoding" : "gzip, deflate, br", 
				"Accept-Language" : "en-US,en", 
				"X-DevTools-Emulate-Network-Conditions-Client-Id" : "969B8CEF25CCA839B3F22A036F8389AB", 
				"Cookie" : "deploymentId=x2sis; JSESSIONID=" + session_id,
				"Connection" : "keep-alive", 
				"X-Do-Not-Track" : "1", 
				"Upgrade-Insecure-Requests" : "1", 
				"User-Agent" : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.11.2 Chrome/65.0.3325.230 Safari/537.36", 
				"Content-Type" : "application/x-www-form-urlencoded", 
				"Accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8", 
				"Cache-Control" : "max-age=0", 
				"Referer" : "https://aspen.cpsd.us/aspen/logon.do", 
				"DNT" : "1"}, 
			"referrer":"https://aspen.cpsd.us/aspen/logon.do", 
			"referrerPolicy":"strict-origin-when-cross-origin", 
			"body":"org.apache.struts.taglib.html.TOKEN=" + apache_token + "&userEvent=930&userParam=&operationId=&deploymentId=x2sis&scrollX=0&scrollY=0&formFocusField=username&mobile=false&SSOLoginDone=&username=" + username + "&password=" + password, 
			"method":"POST", 
			"mode":"cors"}); 
	return page;
}

// Returns object with classes (name, grade, id),
// student oid, and apache_token
async function scrape_academics(session_id) {
	let $ = cheerio.load(await fetch_body("https://aspen.cpsd.us/aspen/portalClassList.do?navkey=academics.classes.list",
		{"credentials":"include",
			"headers":{"Cookie" : "deploymentId=x2sis; JSESSIONID=" + session_id,
				"DNT" : "1",
				"Accept-Encoding" : "gzip, deflate, br",
				"Accept-Language" : "en-US,en",
				"Upgrade-Insecure-Requests" : "1",
				"User-Agent" : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.11.2 Chrome/65.0.3325.230 Safari/537.36",
				"Accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
				"X-DevTools-Emulate-Network-Conditions-Client-Id" : "969B8CEF25CCA839B3F22A036F8389AB",
				"Referer" : "https://aspen.cpsd.us/aspen/home.do",
				"Connection" : "keep-alive",
				"X-Do-Not-Track" : "1"},
			"referrer":"https://aspen.cpsd.us/aspen/home.do",
			"referrerPolicy":"strict-origin-when-cross-origin",
			"body":null,
			"method":"GET",
			"mode":"cors"}));
	let data = {"classes": []};
	$("#dataGrid a").each(function(i, elem) {
		data.classes[i] = {};
		data.classes[i].name = $(this).text();
		data.classes[i].grade = $(this).parent()
			.nextAll().eq(5).text().trim();
		data.classes[i].id = $(this).parent().attr("id");
	});
	data.oid = $("input[name=selectedStudentOid]").attr("value");
	data.apache_token = $("input[name='org.apache.struts.taglib.html.TOKEN']").attr("value");
	return data;
}

// Returns object with categories (name, weight) as a dictionary
async function scrape_details(session_id, apache_token, class_id, oid) {
	let $ = cheerio.load(await fetch_body("https://aspen.cpsd.us/aspen/portalClassList.do",
		{"credentials":"include",
			"headers":{"Connection": "keep-alive",
				"Cache-Control": "max-age=0",
				"Origin": "https://aspen.cpsd.us",
				"Upgrade-Insecure-Requests": "1",
				"Content-Type": "application/x-www-form-urlencoded",
				"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.12.0 Chrome/69.0.3497.128 Safari/537.36", 
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
				"X-Do-Not-Track": "1",
				"Accept-Language": "en-US,en",
				"DNT": "1",
				"Referer": "https://aspen.cpsd.us/aspen/portalClassList.do?navkey=academics.classes.list&maximized=false",
				"Accept-Encoding": "gzip, deflate, br",
				"Cookie": "deploymentId=x2sis; JSESSIONID=" + session_id },
			"referrer":"https://aspen.cpsd.us/aspen/portalClassList.do?navkey=academics.classes.list&maximized=false",
			"referrerPolicy":"strict-origin-when-cross-origin",
			"body":"org.apache.struts.taglib.html.TOKEN=" + apache_token + "&userEvent=2100&userParam=" + class_id + "&operationId=&deploymentId=x2sis&scrollX=0&scrollY=87&formFocusField=&formContents=&formContentsDirty=&maximized=false&menuBarFindInputBox=&selectedStudentOid=" + oid + "&jumpToSearch=&initialSearch=&yearFilter=current&termFilter=current&allowMultipleSelection=true&scrollDirection=&fieldSetName=Default+Fields&fieldSetOid=fsnX2Cls&filterDefinitionId=%23%23%23all&basedOnFilterDefinitionId=&filterDefinitionName=filter.allRecords&sortDefinitionId=default&sortDefinitionName=Schedule+term&editColumn=&editEnabled=false&runningSelection=",
			"method":"POST",
			"mode":"cors"}));
	let data = {};
	$("tr[class=listCell]", "#dataGrid").slice(3).each(function(i, elem) {
		if(i % 2 === 0) {
			let category = $(this).children().first().text();
			let weight = $(this).children().eq(2).text();
			data[category] = "" + parseFloat(weight.substr(0, weight.length - 1)) / 100;
		}
	});
	return data;
}

// Returns list of assignments (name, category, score, max_score)
async function scrape_assignments(session_id, apache_token) {
	let $ = cheerio.load(await fetch_body("https://aspen.cpsd.us/aspen/portalAssignmentList.do?navkey=academics.classes.list.gcd",
		{"credentials":"include",
			"headers":{"Connection": "keep-alive",
				"Upgrade-Insecure-Requests": "1",
				"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.12.0 Chrome/69.0.3497.128 Safari/537.36",
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
				"X-Do-Not-Track": "1",
				"Accept-Language": "en-US,en",
				"DNT": "1",
				"Referer": "https://aspen.cpsd.us/aspen/portalClassDetail.do?navkey=academics.classes.list.detail",
				"Accept-Encoding": "gzip, deflate, br",
				"Cookie": "deploymentId=x2sis; JSESSIONID=" + session_id},
			"referrer":"https://aspen.cpsd.us/aspen/portalClassDetail.do?navkey=academics.classes.list.detail",
			"referrerPolicy":"strict-origin-when-cross-origin",
			"body":null,
			"method":"GET",
			"mode":"cors"}));
	let data = [];
   let page = 1;
    let n_assignments = parseInt($("#totalRecordsCount").text());

    while(true) {
        $("tr.listCell.listRowHeight").each(function(i, elem) {
            let row = {};
            row["name"] = $(this).find("a").first().text();
            row["category"] = $(this).children().eq(2).text().trim();
            //let scores = $(this).find("div[class=percentFieldContainer]");
	    let scores = $(this).find("tr")
                .children().slice(0, 2);
		//console.log(scores.text());
		row["special"] = scores.text();
            if (!isNaN(parseFloat(scores.eq(1).text()))) { // No score
		    scores = scores.eq(1).text().split("/");
                row["score"] = Number(scores[0]);
                row["max_score"] = Number(scores[1]);
            }
            data.push(row);
        });

        if(page * 25 > n_assignments) {
            return data;
        }
        page++;

        $ = cheerio.load((await fetch_body("https://aspen.cpsd.us/aspen/portalAssignmentList.do",
            {"credentials":"include",
                "headers":{
                    "Connection": "keep-alive",
                    "Cache-Control": "max-age=0",
                    "Origin": "https://aspen.cpsd.us",
                    "Upgrade-Insecure-Requests": "1",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.12.0 Chrome/69.0.3497.128 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en",
                    "X-Do-Not-Track": "1",
                    "DNT": "1",
                    "Referer": "https://aspen.cpsd.us/aspen/portalAssignmentList.do",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Cookie": "deploymentId=x2sis; JSESSIONID=" + session_id},
                "referrer":"https://aspen.cpsd.us/aspen/portalAssignmentList.do",
                "referrerPolicy":"strict-origin-when-cross-origin",
                "body":"org.apache.struts.taglib.html.TOKEN=" + apache_token + "&userEvent=10&userParam=&operationId=&deploymentId=x2sis&scrollX=0&scrollY=0&formFocusField=&formContents=&formContentsDirty=&maximized=false&menuBarFindInputBox=&categoryOid=&gradeTermOid=GTM0000000C1sA&jumpToSearch=&initialSearch=&topPageSelected=1&allowMultipleSelection=true&scrollDirection=&fieldSetName=Default+Fields&fieldSetOid=fsnX2ClsGcd&filterDefinitionId=%23%23%23all&basedOnFilterDefinitionId=&filterDefinitionName=filter.allRecords&sortDefinitionId=default&sortDefinitionName=Date+due&editColumn=&editEnabled=false&runningSelection=",
                "method":"POST",
                "mode":"cors"})));
    }
}

// Returns list of black/silver day pairs of class names and room numbers
async function scrape_schedule(username, password, i) {
	return new Promise(async function(resolve, reject) {
		let session = await scrape_login();
		await submit_login(username, password, session.apache_token, session.session_id);
		let $ = cheerio.load(await fetch_body("https://aspen.cpsd.us/aspen/studentScheduleContextList.do?navkey=myInfo.sch.list",
			{"credentials":"include",
				"headers":{"Connection": "keep-alive",
					"Upgrade-Insecure-Requests": "1",
					"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.12.0 Chrome/69.0.3497.128 Safari/537.36",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
					"X-Do-Not-Track": "1",
					"Accept-Language": "en-US,en",
					"DNT": "1",
					"Referer": "https://aspen.cpsd.us/aspen/studentScheduleMatrix.do?navkey=myInfo.sch.matrix&termOid=&schoolOid=null&k8Mode=null&viewDate=2/5/2019&userEvent=0",
					"Accept-Encoding": "gzip, deflate, br",
					"Cookie": "JSESSIONID=" + session.session_id + "; deploymentId=x2sis; _ga=GA1.3.481904573.1547755534; _ga=GA1.2.1668470472.1547906676; _gid=GA1.3.774571258.1549380024"},
				"referrer":"https://aspen.cpsd.us/aspen/studentScheduleMatrix.do?navkey=myInfo.sch.matrix&termOid=&schoolOid=null&k8Mode=null&viewDate=2/5/2019&userEvent=0",
				"referrerPolicy":"strict-origin-when-cross-origin",
				"body":null,
				"method":"GET",
				"mode":"cors"}));
		let data = {black:[], silver:[]};
		$('td[style="width: 125px"]').each(function(i, elem) {
			const parts = $(this).html().trim().split('<br>').slice(1, 4);
			const block = {name: parts[0], teacher: parts[1], room: parts[2]};
			if(i % 2 == 0) {
				data.black[i/2] = block;
			} else {
				data.silver[Math.floor(i/2)] = block;
			}
		});
		log(i, "schedule", data);
		resolve(data);
	});
}

// Returns body of fetch
async function fetch_body(url, options) {
	return (await fetch(url, options)).text();
}

// Logger can easily be turned off or on and modified
function log(thread, name, obj) {
	if(obj) {
		//console.log(`Thread ${thread}:\n\t${name}:\n${util.inspect(obj, false, null, true)}\n`);
	} else {
		//console.log(`Thread ${thread}: ${name}\n`);
	}
}

// --------------Compute Functions------------



// ------------ TESTING ONLY -----------------
if(require.main === module) {
	let prompt = require('prompt');
	let schema = {
		properties: {
			username: {
				pattern: /^[0-9]+$/,
				message: 'Username must be your student id',
				required: true
			},
			password: {
				hidden: true,
				required: true
			}
		}
	};

	prompt.start();
	prompt.get(schema, async function(err, result) {
		//console.log(JSON.stringify(await scrape_student(result.username, result.password)));
		console.log((await scrape_student(result.username, result.password)));
		//let session = await scrape_login();
		//await submit_login(result.username, result.password, session.apache_token, session.session_id);
		//console.log(session);
		//console.log(JSON.stringify(await scrape_schedule(session.session_id)));
	});
}

// -------------------------------------------
