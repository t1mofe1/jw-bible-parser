const express = require('express');
const app = express();

const bibleParser = require('./index');

app.use(require('helmet')());
app.use(express.json());
app.set('json spaces', 2);

app.get('/langCode/:lang', async (req, res) => {
	const { lang } = req.params;

	const code = await bibleParser.getLanguageCode(lang);

	res.send(code);
});
app.get('/translations/:lang', async (req, res) => {
	const { lang } = req.params;

	const translations = await bibleParser.getTranslations(lang);

	res.send(translations);
});
app.get('/books/:lang/:translationID', async (req, res) => {
	const { lang, translationID } = req.params;

	const books = await bibleParser.getBibleBooks(lang, translationID);

	res.send(books);
});
app.get('/verse/:lang/:translationID/:bookNum/:chapterNum/:verseNum', async (req, res) => {
	const { lang, translationID, bookNum, chapterNum, verseNum } = req.params;

	const { type } = req.query;

	if (type === 'canvas') {
		const image = await bibleParser.getBibleVerseImage(lang, translationID, bookNum, chapterNum, verseNum, 'dataURL');

		res.send(`<img src="${image}" style="width: 100%; height: 100%;" />`);
	} else {
		const verse = await bibleParser.getVerse(lang, translationID, bookNum, chapterNum, verseNum);

		res.send(verse);
	}
});

app.use((_, res) => {
	res.status(404).send({
		success: false,
		code: 'not_found',
	});
});

app.use((err, _, res) => {
	console.log(err);
	const obj = {
		success: false,
		code: 'server_error',
	};
	if (process.env.NODE_ENV !== 'production') obj.error = err;
	res.status(503).send(obj);
});

app.listen(process.env.PORT || 3000, () => console.log(`Server started!`));
