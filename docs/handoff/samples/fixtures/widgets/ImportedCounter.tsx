import { useState } from 'react'

export default function ImportedCounter({ initial = 3 }: { initial?: number }) {
  const [count, setCount] = useState(initial)
  return <button onClick={() => setCount((value) => value + 1)}>Imported: {count}</button>
}
