import { Outlet } from 'react-router-dom'
import { Home } from './components/home'

function App() {
  return (
    <Home>
      <Outlet />
    </Home>
  )
}

export default App
