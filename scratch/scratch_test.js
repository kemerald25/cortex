const katex = require('katex');

const testFormula = `Yield = \\frac{Annual\\ Rental\\ Income}{Property\\ Value}`;
try {
  const html = katex.renderToString(testFormula, {
    displayMode: true,
    throwOnError: true
  });
  console.log("SUCCESS RENDERING!");
} catch (e) {
  console.error("ERROR RENDERING:", e.message);
}

const testFormula2 = `Yield = \\frac{Annual\\ Rental\\ Income}{Property\\ Value}`;
console.log("Formula 2:", testFormula2);
