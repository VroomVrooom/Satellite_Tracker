type SatelliteCardProps = {
  code: string
  shortName: string
  description?: string
  onSelect: (code: string) => void
}

export default function SatelliteCard({
  code,
  shortName,
  description,
  onSelect,
}: SatelliteCardProps) {
  return (
    <button
  onClick={() => onSelect(code)}
  className="
    p-5 rounded-xl border border-gray-200
    bg-white shadow-sm
    flex flex-col items-center text-center gap-2
    transition-all duration-200
    hover:shadow-md hover:border-gray-700 hover:bg-gray-300] hover:cursor-pointer
  "
>
  <div className="text-lg font-semibold text-gray-800">{shortName}</div>
  {description && (
    <div className="text-sm text-gray-600">{description}</div>
  )}
</button>
  )
}
