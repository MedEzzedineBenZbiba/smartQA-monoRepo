import Image from "next/image";

export function IssuesCard({
  backgroundColor,
  title,
  value,
  iconSource,
}: {
  backgroundColor: string;
  title: string;
  value: number;
  iconSource: string;
}) {
  return (
    <div
      className={`w-[400px] ${backgroundColor} rounded-2xl h-[230px] p-[35px] `}
    >
      <div className="flex gap-[15px]">
        <Image
          src={iconSource}
          loading="eager"
          width={46}
          height={46}
          className="size-[28px]"
          alt="stack icon"
        />
        <span className="font-bold text-2xl ">{title}</span>
      </div>
      <div className="font-bold text-7xl mt-[15px] ">{value}</div>
    </div>
  );
}
