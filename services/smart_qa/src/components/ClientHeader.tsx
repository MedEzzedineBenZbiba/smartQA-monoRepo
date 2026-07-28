"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/app/data/logout";

export function ClientHeader() {
  const pathname = usePathname();
  const imageStyle = { width: "60px", height: "auto" };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "/icons/statisctics.png" },
    { href: "/issues", label: "Issues", icon: "/icons/agent.png" },
    { href: "/ai-insights", label: "AI Insights", icon: "/icons/IA.png" },
  ];

  return (
    <header className="px-[100px] h-[60px] flex items-center justify-between mt-[2px]">
      <div className="logo flex items-center">
        <Image
          src="/smartQA.svg"
          alt="smartQA logo"
          width={500}
          height={500}
          loading="eager"
          style={imageStyle}
        />
        <span className="font-semibold text-[40px]"> Smart QA</span>
      </div>

      <div className="flex items-center font-semibold">
        <div className="Links flex items-center mr-[44px]">
          {navLinks.map(({ href, label, icon }) => (
            <Link
              key={href}
              className={`flex items-center mr-[25px] ${
                pathname === href ? "border-b-2 border-black border-solid" : ""
              }`}
              href={href}
            >
              <Image
                src={icon}
                width={46}
                height={46}
                className="w-[30px] h-auto mr-1"
                alt={`${label} icon`}
                loading="eager"
              />
              <span className="text-3xl">{label}</span>
            </Link>
          ))}
        </div>

        <div className="logout-button">
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center border-2 border-[#C6C6C6] px-[7px] py-[5px] rounded-2xl hover:bg-gray-50 transition-colors"
            >
              <Image
                src="/icons/logout.png"
                width={46}
                height={46}
                loading="eager"
                className="w-[30px] h-auto"
                alt="logout icon"
              />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
