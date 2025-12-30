import NbaGraph from "@/components/NbaGraph";

export default function Home() {
  return (
    <div className="w-full h-screen">
      <div className="absolute top-4 left-4 z-10 bg-gray-200 border-2 border-gray-300 p-4 rounded-lg shadow-xl">
        <h1 className="text-2xl font-semibold text-black mb-1">
          This is Jason's cool idea
        </h1>
        <p className="text-sm text-black">
          Teammate network viz incoming
        </p>
        <p className="text-xs text-black mt-2 font-medium">
          Click a player to see their teams. Click a team to see teammates.
        </p>
      </div>
      <NbaGraph initialPlayerId={2544} />
    </div>
  );
}
