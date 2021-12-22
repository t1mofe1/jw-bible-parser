const { get: getRequest } = require('axios').default;
const { validate: validateLanguage, getNativeName: getLangName } = require('iso-639-1');

const saved_data = {};
// #region save_data example
/* {
	en: {
		name: "English",
		code: "r1/lp-e",
		translations: {
			nwt: {
				name: "New World Translation of the Holy Scriptures",
				books: {
					1: {
						name: "Genesis",
						chapters: {
							1: {
								1: "In the beginning God created the heaven and the earth.",
							}
						}
					}
				}
			}
		}
	}
} */
// #endregion

const Canvas = require('canvas');

async function getLanguageCode(language = 'en') {
	if (!validateLanguage(language)) throw new Error('Invalid language');

	// if data is cached
	if (saved_data[language]) return saved_data[language].code;

	const code = await getRequest(`https://wol.jw.org/${language}/wol/h/`).then(({ request }) => {
		if (language !== request.path.substring(1, request.path.substring(1).search('/') + 1)) throw Error('Wrong language');
		return request.path.substring(10);
	});

	// cache the data
	Object.assign(saved_data, {
		...saved_data,
		[language]: {
			name: getLangName(language),
			code,
		},
	});

	return code;
}

async function getTranslations(language = 'en') {
	if (!validateLanguage(language)) throw new Error('Invalid language');

	const code = await getLanguageCode(language);

	// if data is cached
	if (Object.keys(saved_data[language].translations || {}).length) return saved_data[language].translations;

	const translationsHTML = await getRequest(`https://wol.jw.org/${language}/wol/bibles/${code}`)
		.then((res) => res.data)
		.catch(({ res }) => {
			if (res.status >= 500) throw Error('wol.jw.org server is not available');
			else if (res.status === 404) throw Error('Not found');
			else throw Error('Unknown error occured');
		});
	let $ = require('cheerio').load(translationsHTML);
	$ = $.load($(`ul.directory`)[0]);

	const translations = {};
	$('li a').each((_, el) => {
		const link = el.attribs.href;
		const id = link.substring(link.lastIndexOf('/') + 1);

		const name = $.load($(el).html())('.cardTitleBlock').text().trim();

		const year = $.load($(el).html())('.cardTitleDetail').text().trim();

		translations[id] = { link, name, year, books: {} };
	});

	// cache the data
	Object.assign(saved_data[language], {
		...saved_data[language],
		translations,
	});

	return translations;
}

async function getBibleBooks(language = 'en', translationID) {
	const translations = await getTranslations(language);
	translationID = Number(translationID) || Object.keys(saved_data[language].translations)[0];
	const translation = translations[translationID] || translations[Object.keys(translations)[0]];

	// if data is cached
	if (Object.keys(saved_data[language].translations[translationID].books || {}).length) return saved_data[language].translations[translationID].books;

	const booksHTML = await getRequest(new URL(translation.link, `https://wol.jw.org/`).toString())
		.then((res) => res.data)
		.catch(({ res }) => {
			if (res.status >= 500) throw Error('wol.jw.org server is not available');
			else if (res.status === 404) throw Error('Not found');
			else throw Error('Unknown error occured');
		});
	let $ = require('cheerio').load(booksHTML);

	const books = {};

	$('li.book a span.name').each(
		(i, name) =>
			(books[i + 1] = {
				name: $(name).text().trim(),
				chapters: {},
			}),
	);

	// cache the data
	Object.assign(saved_data[language].translations[translationID], {
		...saved_data[language].translations[translationID],
		books,
	});

	return books;
}

// TODO: create multiple verse system
async function getVerse(language = 'en', translationID, bookNum, chapterNum, verseNum) {
	bookNum = Number(bookNum) || 1;
	chapterNum = Number(chapterNum) || 1;
	verseNum = Number(verseNum) || 1;

	const translations = await getTranslations(language);
	translationID = Number(translationID) || Object.keys(saved_data[language].translations)[0];
	const translation = translations[translationID] || translations[Object.keys(translations)[0]];

	const books = await getBibleBooks(language, translationID);
	const book = books[bookNum - 1] || books[Object.keys(books)[0]];

	// if data is cached
	if (saved_data[language].translations[translationID].books[bookNum].chapters[chapterNum] && saved_data[language].translations[translationID].books[bookNum].chapters[chapterNum][verseNum])
		return saved_data[language].translations[translationID].books[bookNum].chapters[chapterNum][verseNum];

	const verseHTML = await getRequest(new URL(`${translation.link.replace('binav', 'b')}/${bookNum}/${chapterNum}/`, `https://wol.jw.org/`).toString())
		.then((res) => res.data)
		.catch(({ response: res }) => {
			if (res.status >= 500) throw Error('wol.jw.org server is not available');
			else if (res.status === 404) throw Error('Not found');
			else throw Error('Unknown error occured');
		});
	let $ = require('cheerio').load(verseHTML);

	let verse = '';
	$(`span.v`).each((_, span) => {
		const verseID = Number($(span).attr('id').split('-')[2]);

		if (verseID === verseNum) verse = $(span).text().replaceAll(/\+|\*/g, '').trim();
	});

	verse = verse.split(' ').slice(1).join(' ');

	// cache the data
	Object.assign(saved_data[language].translations[translationID].books[bookNum].chapters, {
		...saved_data[language].translations[translationID].books[bookNum].chapters,
		[chapterNum]: {
			[verseNum]: verse,
		},
	});

	return verse;
}

/**
 *
 * @param {string} [language=en] - language
 * @param {string} [translationID] - translation ID
 * @param {string} [bookNum] - book Num
 * @param {number} [chapterNum] - chapter Num
 * @param {number|number[]} [verseNum] - verse Num
 * @returns {Buffer} - Canvas buffer with bible verse
 */
async function getBibleVerseImage(language = 'en', translationID, bookNum, chapterNum, verseNum, outputType = 'data') {
	bookNum = Number(bookNum) || 1;
	chapterNum = Number(chapterNum) || 1;
	verseNum = Number(verseNum) || 1;

	const func = outputType === 'dataURL' ? 'toDataURL' : 'toBuffer';

	if (!validateLanguage(language)) throw new Error('Invalid language');

	const translations = await getTranslations(language);
	translationID = Number(translationID) || Object.keys(saved_data[language].translations)[0];
	const translation = translations[translationID] || translations[Object.keys(translations)[0]];

	const books = await getBibleBooks(language, translation.id);
	const book = books[bookNum - 1] || books[Object.keys(books)[0]];

	const verse = await getVerse(language, translationID, bookNum, chapterNum, verseNum);

	const canvas = Canvas.createCanvas(1920, 1080);
	const ctx = canvas.getContext('2d');

	// BACKGROUND
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// MULTILINE TEXT
	const words = verse.split(' ');
	let lines = [];

	const options = {
		rect: {
			x: (canvas.width / 4) * 1.5,
			y: (canvas.height / 4) * 1.5,
			width: (canvas.width / 4) * 3,
			height: (canvas.height / 4) * 3,
		},
	};

	let fontSize;
	const minFontSize = 15;
	const maxFontSize = 75;
	for (fontSize = minFontSize; fontSize <= maxFontSize; fontSize++) {
		// line_height - 1.1
		const lineHeight = fontSize * 1.1;

		ctx.font = `${fontSize}px sans-serif`;

		// Start
		let y = options.rect.y + fontSize; // It's the bottom line of the letters
		lines = [];
		let line = '';

		for (const word of words) {
			const linePlus = line + word + ' ';
			if (ctx.measureText(linePlus).width > options.rect.width) {
				lines.push({ text: line, x: canvas.width / 2 - ctx.measureText(line).width / 2, y });
				line = word + ' ';
				y += lineHeight;
			} else {
				line = linePlus;
			}
		}

		lines.push({ text: line, x: canvas.width / 2 - ctx.measureText(line).width / 2, y });

		if (y > options.rect.height) break;
	}

	const linesHeight = lines[lines.length - 1].y + fontSize * 1.1 - lines[0].y;

	// CENTER
	// ctx.beginPath();
	// ctx.moveTo(0, canvas.height / 2);
	// ctx.lineTo(canvas.width, canvas.height / 2);
	// ctx.strokeStyle = '#0f0';
	// ctx.stroke();

	let startY = canvas.height / 2 - linesHeight / 2 - fontSize * 1.1;

	// ctx.beginPath();
	// ctx.moveTo(0, startY);
	// ctx.lineTo(canvas.width, startY);
	// ctx.strokeStyle = '#00f';
	// ctx.stroke();

	// ctx.beginPath();
	// ctx.moveTo(0, startY + linesHeight);
	// ctx.lineTo(canvas.width, startY + linesHeight);
	// ctx.strokeStyle = '#0ff';
	// ctx.stroke();

	// let endY = canvas.height - (canvas.height - (canvas.height - (startY + linesHeight))) / 2;
	// let text = `${endY}px`;
	// let endX = canvas.width / 2 - ctx.measureText(text).width / 2;

	// console.log({ startY, endY, linesHeight });
	// ctx.fillStyle = '#f00';
	// ctx.fillText(text, endX, endY);

	let y = Number(startY);
	for (const line of lines) {
		y += fontSize * 1.1;

		line.y = y;
		// console.log({ lineY: line.y, y });
	}

	ctx.fillStyle = '#fff';
	for (const line of lines) ctx.fillText(line.text.trim(), line.x, line.y);

	let _text = `${book.name} ${bookNum}:${verseNum}`;
	ctx.fillText(_text, canvas.width / 2 - ctx.measureText(_text).width / 2, y + 225);

	return canvas[func]();
}

module.exports = { getLanguageCode, getTranslations, getBibleBooks, getVerse, getBibleVerseImage };
