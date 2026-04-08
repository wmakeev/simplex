import { html } from 'htm/preact'

export function DocsView() {
  return html`
    <div class="docs-content">
      <h2>SimplEx Language Reference</h2>
      <p>SimplEx is a safe, sandboxed expression language for evaluating user-provided formulas against data. No statements, no assignments (except <code class="docs-code">let</code>), no side effects — only expressions that compute a value.</p>

      <div class="docs-section">
        <h3>Literals</h3>
        <ul>
          <li><strong>Numbers:</strong> <code class="docs-code">42</code>, <code class="docs-code">.5</code>, <code class="docs-code">1.2e3</code>, <code class="docs-code">0xFF</code></li>
          <li><strong>Strings:</strong> <code class="docs-code">"hello"</code>, <code class="docs-code">'world'</code> (with <code class="docs-code">\\n</code>, <code class="docs-code">\\t</code>, <code class="docs-code">\\uXXXX</code> escapes)</li>
          <li><strong>Booleans:</strong> <code class="docs-code">true</code>, <code class="docs-code">false</code></li>
          <li><strong>Null:</strong> <code class="docs-code">null</code></li>
          <li><strong>Undefined:</strong> <code class="docs-code">undefined</code> (identifier, not keyword)</li>
        </ul>
      </div>

      <div class="docs-section">
        <h3>Operators (by precedence, highest first)</h3>
        <table class="docs-table">
          <thead>
            <tr><th>Prec</th><th>Operators</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td><code class="docs-code">+x</code> <code class="docs-code">-x</code> <code class="docs-code">not x</code> <code class="docs-code">typeof x</code></td><td>Unary. <code class="docs-code">not</code> returns boolean</td></tr>
            <tr><td>2</td><td><code class="docs-code">^</code></td><td>Exponentiation, right-associative</td></tr>
            <tr><td>3</td><td><code class="docs-code">*</code> <code class="docs-code">/</code> <code class="docs-code">mod</code></td><td>Multiplicative</td></tr>
            <tr><td>4</td><td><code class="docs-code">+</code> <code class="docs-code">-</code></td><td>Additive (numbers only)</td></tr>
            <tr><td>5</td><td><code class="docs-code">${'&'}</code></td><td>String concatenation (coerces to string)</td></tr>
            <tr><td>6</td><td><code class="docs-code">${'<'}</code> <code class="docs-code">${'<'}=</code> <code class="docs-code">${'>'}</code> <code class="docs-code">${'>'}=</code> <code class="docs-code">in</code></td><td>Relational. <code class="docs-code">in</code> checks key membership</td></tr>
            <tr><td>7</td><td><code class="docs-code">==</code> <code class="docs-code">!=</code></td><td>Equality (strict)</td></tr>
            <tr><td>8</td><td><code class="docs-code">and</code> <code class="docs-code">&&</code></td><td>Logical AND (short-circuit, returns boolean)</td></tr>
            <tr><td>9</td><td><code class="docs-code">or</code> <code class="docs-code">||</code></td><td>Logical OR (short-circuit, returns boolean)</td></tr>
            <tr><td>10</td><td><code class="docs-code">??</code></td><td>Nullish coalescing</td></tr>
            <tr><td>11</td><td><code class="docs-code">|</code> <code class="docs-code">|?</code> <code class="docs-code">|${'>'}</code></td><td>Pipe operators</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Collections</h3>
        <ul>
          <li><strong>Arrays:</strong> <code class="docs-code">[1, 2, 3]</code>, <code class="docs-code">[1, , 3]</code> (sparse), trailing comma OK</li>
          <li><strong>Objects:</strong> <code class="docs-code">{a: 1, "b-c": 2}</code>, trailing comma OK</li>
        </ul>
      </div>

      <div class="docs-section">
        <h3>Property Access</h3>
        <ul>
          <li><strong>Dot:</strong> <code class="docs-code">obj.prop</code>, <code class="docs-code">obj.nested.deep</code></li>
          <li><strong>Computed:</strong> <code class="docs-code">obj["key"]</code>, <code class="docs-code">arr[0]</code>, <code class="docs-code">str[0]</code></li>
          <li><strong>Extension:</strong> <code class="docs-code">obj::method</code> — <em>reserved</em>, throws error by default. Override <code class="docs-code">getProperty</code> in compile options to implement.</li>
          <li>Null-safe: <code class="docs-code">null.prop</code> → <code class="docs-code">undefined</code></li>
          <li>Strings: only numeric index access; <code class="docs-code">"str".foo</code> → error</li>
        </ul>
      </div>

      <div class="docs-section">
        <h3>Function Calls</h3>
        <ul>
          <li><code class="docs-code">func()</code>, <code class="docs-code">func(a, b)</code>, <code class="docs-code">obj.method(x)</code></li>
          <li>Null-safe: calling <code class="docs-code">null</code>/<code class="docs-code">undefined</code> as function → <code class="docs-code">undefined</code></li>
          <li>Chaining: <code class="docs-code">a.b()()</code>, <code class="docs-code">thunk()(arg)</code></li>
        </ul>
      </div>

      <div class="docs-section">
        <h3>Currying (<code class="docs-code">#</code> placeholder)</h3>
        <p><code class="docs-code">#</code> in call arguments creates a partially applied function:</p>
        <pre class="docs-code-block"><code>add(#, 3)      // → x => add(x, 3)
add(1, #)      // → x => add(1, x)
fn(#, y, #)    // → (a, b) => fn(a, y, b)</code></pre>
      </div>

      <div class="docs-section">
        <h3>Conditional</h3>
        <pre class="docs-code-block"><code>if condition then consequent else alternate
if condition then consequent              // else → undefined</code></pre>
        <p>Falsy values: <code class="docs-code">0</code>, <code class="docs-code">""</code>, <code class="docs-code">false</code>, <code class="docs-code">null</code>, <code class="docs-code">undefined</code>, <code class="docs-code">NaN</code>.</p>
      </div>

      <div class="docs-section">
        <h3>Pipe Operators</h3>
        <p><code class="docs-code">expr | next | another</code> — chain values through expressions. <code class="docs-code">%</code> (topic reference) holds the piped value.</p>
        <ul>
          <li><code class="docs-code">|</code> — standard pipe: <code class="docs-code">5 | % + 1</code> → <code class="docs-code">6</code></li>
          <li><code class="docs-code">|?</code> — optional pipe: short-circuits on <code class="docs-code">null</code>/<code class="docs-code">undefined</code></li>
          <li><code class="docs-code">|${'>'}</code> — <em>reserved</em>, throws error by default. Override <code class="docs-code">pipe</code> in compile options to implement.</li>
        </ul>
        <pre class="docs-code-block"><code>1 | add(%, 2) | % * 4    // → 12</code></pre>
      </div>

      <div class="docs-section">
        <h3>Lambda Expressions</h3>
        <pre class="docs-code-block"><code>x => x + 1                    // single param
(a, b) => a + b               // multiple params
() => 42                      // no params
a => b => a + b               // curried (nested)</code></pre>
        <p>Lambdas are closures — they capture the enclosing scope. Parameters shadow outer variables.</p>
      </div>

      <div class="docs-section">
        <h3>Let Expressions</h3>
        <pre class="docs-code-block"><code>let x = 5, x + 1              // → 6
let a = 1, b = a + 1, a + b   // → 3 (sequential binding)</code></pre>
        <p>Bindings are sequential: each init sees previous bindings. Duplicate names → CompileError. The last comma-separated expression is the body.</p>
      </div>

      <div class="docs-section">
        <h3>Comments</h3>
        <ul>
          <li>Single-line: <code class="docs-code">// comment</code></li>
          <li>Multi-line: <code class="docs-code">/* comment */</code></li>
        </ul>
      </div>

      <div class="docs-section">
        <h3>Reserved Words</h3>
        <p><code class="docs-code">if</code>, <code class="docs-code">then</code>, <code class="docs-code">else</code>, <code class="docs-code">and</code>, <code class="docs-code">or</code>, <code class="docs-code">not</code>, <code class="docs-code">in</code>, <code class="docs-code">mod</code>, <code class="docs-code">typeof</code>, <code class="docs-code">let</code>, <code class="docs-code">true</code>, <code class="docs-code">false</code>, <code class="docs-code">null</code> — cannot be used as identifiers.</p>
      </div>

      <div class="docs-section">
        <h3>Data & Scope Resolution</h3>
        <p>Identifier lookup order: local scope (lambda params, let bindings) → closure → globals → data → error.</p>
        <p>Globals are compile-time constants that override data. Data is the runtime parameter passed when calling the compiled function.</p>
      </div>

      <h2 style="margin-top: 24px">Standard Library</h2>
      <p>Enable the <code class="docs-code">stdlib</code> toggle in the header to use standard library functions. The stdlib provides namespaced functions and extension methods for common operations.</p>

      <div class="docs-section">
        <h3>Key Differences from JavaScript</h3>
        <ul>
          <li><strong>NaN → null:</strong> Functions that would produce <code class="docs-code">NaN</code> in JS return <code class="docs-code">null</code> instead. Use <code class="docs-code">??</code> for defaults: <code class="docs-code">Math.sqrt(x) ?? 0</code></li>
          <li><strong>Immutable:</strong> <code class="docs-code">Arr.sort(a)</code>, <code class="docs-code">Arr.reverse(a)</code> return new arrays — originals unchanged</li>
          <li><strong>Type guards:</strong> <code class="docs-code">Str.*</code> and <code class="docs-code">Arr.*</code> functions throw <code class="docs-code">UnexpectedTypeError</code> on wrong input type</li>
          <li><strong>Standalone functions:</strong> <code class="docs-code">Str.toUpperCase("hello")</code> instead of <code class="docs-code">"hello".toUpperCase()</code></li>
        </ul>
      </div>

      <div class="docs-section">
        <h3>Dual Access: Namespaces and Extensions</h3>
        <p>Every namespaced function is available in two styles:</p>
        <pre class="docs-code-block"><code>Arr.map(items, x => x.name)     // namespace style
items::map(x => x.name)          // extension style (chainable)

// Extension chaining
items::filter(x => x.active)::map(x => x.name)::sort()::join(", ")</code></pre>
      </div>

      <div class="docs-section">
        <h3>Top-Level Utilities</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">empty(val)</code></td><td><code class="docs-code">true</code> for null, undefined, NaN, "", [], {}. <code class="docs-code">false</code> for 0, false.</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">exists(val)</code></td><td><code class="docs-code">true</code> if not null, undefined, or NaN. <code class="docs-code">true</code> for 0, "", false.</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">typeOf(val)</code></td><td>Returns type string: "number", "string", "Array", "Object", "Null", "NaN", etc.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Str (String Functions)</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>JS Equivalent</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">toString(val)</code></td><td>String(val)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">length(s)</code></td><td>s.length</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">toUpperCase(s)</code></td><td>s.toUpperCase()</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">toLowerCase(s)</code></td><td>s.toLowerCase()</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">trim(s)</code></td><td>s.trim()</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">split(s, sep)</code></td><td>s.split(sep)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">includes(s, query)</code></td><td>s.includes(query)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">startsWith(s, query)</code></td><td>s.startsWith(query)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">endsWith(s, query)</code></td><td>s.endsWith(query)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">slice(s, start, end?)</code></td><td>s.slice(start, end)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">replaceAll(s, from, to)</code></td><td>s.replaceAll(from, to)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">indexOf(s, query)</code></td><td>s.indexOf(query)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">padStart(s, len, fill?)</code></td><td>s.padStart(len, fill)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">padEnd(s, len, fill?)</code></td><td>s.padEnd(len, fill)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">repeat(s, count)</code></td><td>s.repeat(count)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">charAt(s, index)</code></td><td>s[index]</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Num (Number Functions)</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">toString(n, radix?)</code></td><td>n.toString(radix)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">parseInt(s, radix?)</code></td><td>Returns null instead of NaN</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">parseFloat(s)</code></td><td>Returns null instead of NaN</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">isFinite(n)</code></td><td>Same as Number.isFinite</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">isInteger(n)</code></td><td>Same as Number.isInteger</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">isNaN(n)</code></td><td>Same as Number.isNaN</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">toFixed(n, digits?)</code></td><td>n.toFixed(digits)</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Math</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">abs(n)</code>, <code class="docs-code">round(n)</code>, <code class="docs-code">floor(n)</code>, <code class="docs-code">ceil(n)</code>, <code class="docs-code">trunc(n)</code></td><td>Rounding / absolute value</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">sqrt(n)</code>, <code class="docs-code">cbrt(n)</code></td><td>Square / cube root. Negative → null</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">pow(base, exp)</code></td><td>Exponentiation</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">log(n)</code>, <code class="docs-code">log2(n)</code>, <code class="docs-code">log10(n)</code></td><td>Logarithms. Negative → null</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">min(...args)</code>, <code class="docs-code">max(...args)</code></td><td>Any non-number → null</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">sin</code>, <code class="docs-code">cos</code>, <code class="docs-code">tan</code>, <code class="docs-code">asin</code>, <code class="docs-code">acos</code>, <code class="docs-code">atan</code>, <code class="docs-code">atan2</code></td><td>Trigonometric</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">clamp(n, min, max)</code></td><td>Clamp value to range</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">random()</code></td><td>Random number [0, 1)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">PI</code>, <code class="docs-code">E</code></td><td>Constants</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Arr (Array Functions)</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">length(a)</code></td><td>a.length</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">map(a, fn)</code>, <code class="docs-code">filter(a, fn)</code>, <code class="docs-code">find(a, fn)</code></td><td>Standard iterators</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">every(a, fn)</code>, <code class="docs-code">some(a, fn)</code></td><td>Boolean tests</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">reduce(a, fn)</code>, <code class="docs-code">fold(a, fn, init)</code></td><td>Reduce (fold has explicit init)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">flat(a, depth?)</code>, <code class="docs-code">flatMap(a, fn)</code></td><td>Flattening</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">includes(a, val)</code>, <code class="docs-code">indexOf(a, val)</code></td><td>Search</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">slice(a, start?, end?)</code></td><td>Subarray</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">join(a, sep?)</code></td><td>Join to string</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">sort(a, fn?)</code></td><td>Immutable sort (toSorted)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">reverse(a)</code></td><td>Immutable reverse (toReversed)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">concat(a, ...arrays)</code></td><td>Concatenation</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">from(val)</code>, <code class="docs-code">of(...args)</code></td><td>Factory (namespace only)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">at(a, index)</code></td><td>Supports negative indices</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Obj (Object Functions)</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">keys(o)</code>, <code class="docs-code">values(o)</code>, <code class="docs-code">entries(o)</code></td><td>Same as Object.keys/values/entries</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">fromEntries(entries)</code></td><td>Same as Object.fromEntries</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">assign(...objs)</code></td><td>Immutable — always returns new object</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">has(o, key)</code></td><td>Same as Object.hasOwn</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Json</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">parse(s)</code></td><td>JSON.parse(s)</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">stringify(val, replacer?, indent?)</code></td><td>JSON.stringify</td></tr>
          </tbody>
        </table>
      </div>

      <div class="docs-section">
        <h3>Date (Minimal)</h3>
        <table class="docs-table">
          <thead>
            <tr><th style="width:auto;text-align:left">Function</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left"><code class="docs-code">now()</code></td><td>Unix timestamp in ms</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">parse(s)</code></td><td>Returns null for invalid dates</td></tr>
            <tr><td style="text-align:left"><code class="docs-code">toString(ts)</code></td><td>ISO string from timestamp. Returns null for invalid input</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `
}
