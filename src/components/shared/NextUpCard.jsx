export default function NextUpCard({ cours }) {
  if (!cours) return null;

  return (
    <div className="border-2 border-red-500 bg-red-50 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-red-700">
          {cours.subjects?.nom}
        </h3>

        <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs">
          À venir
        </span>
      </div>

      <p className="mt-2 text-sm">
        {cours.classes?.nom}
      </p>

      <p className="text-sm font-medium">
        {cours.heure_debut?.slice(0,5)}
        {" - "}
        {cours.heure_fin?.slice(0,5)}
      </p>
    </div>
  );
}