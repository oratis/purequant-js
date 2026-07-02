/** Pure linear algebra on number[] / number[][]. No dependencies. */
export type Vector = number[];
export type Matrix = number[][];

export function dot(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error(`dot length mismatch: ${a.length} vs ${b.length}`);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function matvec(a: Matrix, x: Vector): Vector {
  return a.map((row) => dot(row, x));
}

export function transpose(a: Matrix): Matrix {
  if (a.length === 0) return [];
  return a[0].map((_, j) => a.map((row) => row[j]));
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  const bt = transpose(b);
  return a.map((row) => bt.map((col) => dot(row, col)));
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/** Solve A x = b via Gaussian elimination with partial pivoting. */
export function solve(a: Matrix, b: Vector): Vector {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-15) throw new Error("matrix is singular or near-singular");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const piv = m[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / piv;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export function inverse(a: Matrix): Matrix {
  const n = a.length;
  const eye = identity(n);
  const cols: Matrix = [];
  for (let j = 0; j < n; j++) cols.push(solve(a, eye.map((row) => row[j])));
  return transpose(cols);
}

/** Add a small ridge to the diagonal to keep a covariance-like matrix invertible. */
export function makePsd(a: Matrix, ridge = 1e-8): Matrix {
  return a.map((row, i) => row.map((v, j) => (i === j ? v + ridge : v)));
}
