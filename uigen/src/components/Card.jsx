export default function Card({ title, description }) {
  return (
    <div className="max-w-sm rounded-2xl shadow-md border border-gray-200 bg-white p-6 hover:shadow-lg transition-shadow duration-300">
      <h2 className="text-xl font-semibold text-gray-800 mb-2">{title}</h2>
      <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
