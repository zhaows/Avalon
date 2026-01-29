import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'
import GamePage from './pages/GamePage'
import ToastContainer from './components/ToastContainer'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="/game/:roomId" element={<GamePage />} />
        </Routes>
        <ToastContainer />
      </div>
    </BrowserRouter>
  )
}

export default App
