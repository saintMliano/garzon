/**
 * Local inexistente o dado de baja.
 *
 * Va acompañado de un HTTP 404 real (lo emite `notFound()` desde la página): un
 * QR mal impreso no debe indexarse en buscadores como una página válida.
 */
export default function LocalNoEncontrado() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center min-h-screen">
      <div className="animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-stone-100 flex items-center justify-center text-4xl mb-5">🔍</div>
        <h2 className="text-xl font-bold text-stone-800">Local no encontrado</h2>
        <p className="text-stone-500 mt-2 text-sm">Verifica el link o escanea el QR nuevamente.</p>
      </div>
    </div>
  );
}
