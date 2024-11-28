const api = require('@actual-app/api');
const jsdom = require("jsdom");
const { closeBudget, ensurePayee, getAccountBalance, getAccountNote, openBudget, showPercent, sleep } = require('./utils');
require("dotenv").config();

async function getZestimate(URL) {
  let response = undefined;
  try {
    response = await fetch(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.6',
        'Referer': 'https://www.google.com/',
      }
    });
  } catch (error) {
    console.log('Error fetching Zillow URL:');
    console.log(error);
    return undefined;
  }

  const html = await response.text();
  try {
    const dom = new jsdom.JSDOM(html);

    const zestimateText = dom.window.document.getElementById('home-details-home-values').getElementsByTagName('h3')[0].textContent;
    return parseInt(zestimateText.replace('$', '').replaceAll(',', '')) * 100;
  } catch (error) {
    console.log('Error parsing Zillow page:');
    console.log(error);
    console.log(html);
  }
  return undefined;
}

(async function() {
  await openBudget();

  const payeeId = await ensurePayee(process.env.ZESTIMATE_PAYEE_NAME || 'Zestimate');

  const accounts = await api.getAccounts();
  for (const account of accounts) {
    const note = await getAccountNote(account);

    if (note && note.indexOf('zestimate:') > -1) {
      const URL = note.split('zestimate:')[1].split(' ')[0];

      let ownership = 1;
      if (note.indexOf('ownership:') > -1) {
        ownership = parseFloat(note.split('ownership:')[1].split(' ')[0]);
      }

      console.log('Fetching zestimate for account:', account.name);
      console.log('Zillow URL:', URL);

      const zestimate = await getZestimate(URL);
      if (!zestimate) {
          console.log('Was unable to get Zestimate, skipping');
          continue;
      }
      const balance = await getAccountBalance(account);
      const diff = (zestimate * ownership) - balance;

      console.log('Zestimate:', zestimate);
      console.log('Ownership:', zestimate * ownership);
      console.log('Balance:', balance);
      console.log('Difference:', diff);

      if (diff != 0) {
        await api.importTransactions(account.id, [{
          date: new Date(),
          payee: payeeId,
          amount: diff,
          cleared: true,
          reconciled: true,
          notes: `Update Zestimate to ${zestimate * ownership / 100} (${zestimate / 100}*${showPercent(ownership)})`,
        }]);
      }

      await sleep(1324);
    }
  }

  await closeBudget();
})();
