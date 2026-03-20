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
    </div>
  `
}
