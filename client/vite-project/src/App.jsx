import MpesaCheckout from './MpesaCheckout.jsx'
import './App.css'

function App() {
  return (
    <section id="center">
      <MpesaCheckout
        amount={100}
        onSuccess={(tx) => console.log('success', tx)}
        onFailure={(msg) => console.log('failure', msg)}
      />
    </section>
  )
}

export default App
