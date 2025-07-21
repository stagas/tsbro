import { useState } from 'preact/hooks'
import throwConfetti from 'confetti'

export const App = () => {
  const [count, setCount] = useState(0)
  const increment = () => setCount(count + 1)

  return <div class="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
    <h1 class="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-8">Welcome to the App!</h1>
    <p class="text-xl text-gray-600 dark:text-gray-300 mb-4">Count: {count}</p>
    <button
      class="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 dark:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200"
      onClick={() => { increment(); throwConfetti() }}
    >
      Click me!
    </button>
  </div>
}
