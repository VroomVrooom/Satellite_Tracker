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
    p-5 rounded-xl
    bg-gray-700 shadow-sm border border-gray-600
    flex flex-row items-center text-center gap-2
    transition-all duration-200
    hover:shadow-md hover:border hover:border-gray-500 hover:bg-gray-300] hover:cursor-pointer
  "
>
  <div className="text-lg font-bold text-gray-400">{shortName}</div>
  {description && (
    <div className="text-sm text-gray-200">{description}</div>
  )}
</button>
  )
}
