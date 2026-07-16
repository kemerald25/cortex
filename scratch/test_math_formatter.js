function formatMathText(math) {
  const latexKeywords = new Set([
    'frac', 'times', 'cdot', 'left', 'right', 'ldots', 'text', 'mathrm',
    'sqrt', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'sigma',
    'mu', 'lambda', 'sum', 'int', 'log', 'sin', 'cos', 'tan', 'lim', 'in',
    'infty', 'pm', 'div', 'approx', 'neq', 'le', 'ge', 'to', 'cap', 'cup'
  ]);

  let processed = math.replace(/([a-zA-Z])\\\s+([a-zA-Z])/g, '$1 $2');
  
  const tokenRegex = /(\\[a-zA-Z]+|[{}[\]()+\-*\/=,_^]|\s+|[a-zA-Z][a-zA-Z\s]*[a-zA-Z]|[a-zA-Z]|\d+(?:\.\d+)?)/g;
  const tokens = processed.match(tokenRegex) || [processed];
  
  let inTextMode = false;
  let braceDepth = 0;
  
  const resultTokens = tokens.map((token) => {
    if (token.startsWith('\\text') || token.startsWith('\\mathrm')) {
      inTextMode = true;
      braceDepth = 0;
      return token;
    }
    
    if (inTextMode) {
      if (token === '{') braceDepth++;
      if (token === '}') {
        braceDepth--;
        if (braceDepth <= 0) {
          inTextMode = false;
        }
      }
      return token;
    }
    
    if (token.startsWith('\\')) {
      return token;
    }
    
    if (/^[a-zA-Z][a-zA-Z\s]*[a-zA-Z]$/.test(token) && token.trim().length >= 2) {
      const trimmed = token.trim();
      if (latexKeywords.has(trimmed.toLowerCase())) {
        return token;
      }
      return `\\text{${trimmed}}`;
    }
    
    return token;
  });
  
  return resultTokens.join('');
}

const input1 = "Yield = \\frac{Annual\\ Rental\\ Income}{Property\\ Value}";
console.log("Input 1:", input1);
console.log("Output 1:", formatMathText(input1));

const input2 = "n = N \\times \\frac{Z^2 \\times p \\times (1-p)}{e^2}";
console.log("Input 2:", input2);
console.log("Output 2:", formatMathText(input2));

const input3 = "NPV = \\frac{CF_1}{(1 + r)^1} + \\frac{CF_2}{(1 + r)^2}";
console.log("Input 3:", input3);
console.log("Output 3:", formatMathText(input3));
