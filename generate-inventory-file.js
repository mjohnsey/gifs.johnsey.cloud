const fs = require('fs');
const path = require('path');

const main = async () => {
  const dir = path.join('.', 'gifs')
  const files = fs.readdirSync('./gifs').map(f => path.join(dir, f))
  const inventory = files.reduce((obj, f) => {
    const name = path.basename(f, '.gif')
    obj[name] = f
    return obj
  }, {});
  console.log(JSON.stringify({gifs: inventory}))
};

(async () => {
  try {
    await main();
  } catch (e) {
    console.error(e);
  }
})();
