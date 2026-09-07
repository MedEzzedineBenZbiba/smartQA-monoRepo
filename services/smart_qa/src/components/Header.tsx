"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { getOneLetterFromUserName } from "@/lib/extractDataFromSession";
import { logout } from "@/app/data/logout";
import { Employee } from "@/types/employee.type";
import { getAuthentificatedUser } from "@/services/users.service";

function NavItem({
  href,
  icon,
  label,
  isActive,
}: {
  href: string;
  icon: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
        isActive
          ? "bg-gray-100 text-blue-600 font-semibold"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <Image src={icon} width={22} height={22} alt={`${label} icon`} />
      <span className="text-base">{label}</span>
    </Link>
  );
}

export function Header(sessionData: SessionData) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const avatarLetter = getOneLetterFromUserName(sessionData);
  const [user, setUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      const fetchedUser = await getAuthentificatedUser(sessionData);
      setUser(fetchedUser);
      setIsLoading(false);
    }
    fetchUser();
  }, [sessionData]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="px-6 md:px-12 xl:px-24 h-16 flex items-center justify-between border-b border-gray-200 bg-white">
      {/* Logo Area */}
      <div className="flex items-center gap-3">
        <Image
          src="/smartQA.svg"
          alt="Smart QA"
          width={40}
          height={40}
          priority
        />
        <span className="font-bold text-xl tracking-tight text-gray-900">
          Smart QA
        </span>
      </div>

      {/* Navigation Area */}
      <nav className="flex items-center gap-4">
        <NavItem
          href="/dashboard"
          icon="/icons/statisctics.png"
          label="Dashboard"
          isActive={pathname === "/dashboard"}
        />

        {isLoading ? (
          <div className="w-32 h-8 bg-gray-200 animate-pulse rounded-md" /> // Skeleton loader
        ) : (
          <>
            {user?.role.includes("superadmin") && (
              <NavItem
                href="/employees"
                icon="/icons/agent.png"
                label="Employees"
                isActive={pathname === "/employees"}
              />
            )}

            {/* Software Engineer nav: full issue tooling */}
            {user?.role.includes("Software engineer") && (
              <>
                <NavItem
                  href="/issues"
                  icon="/icons/IA.png"
                  label="Issues"
                  isActive={pathname === "/issues"}
                />
                <NavItem
                  href="/ai-insight"
                  icon="/icons/IA.png"
                  label="AI Insight"
                  isActive={pathname === "/ai-insight"}
                />
              </>
            )}

            {/* QA nav: AI Insight only (chat lives inside it as a widget) */}
            {user?.role.includes("QA") && (
              <>
                <NavItem
                  href="/ai-insight"
                  icon="/icons/IA.png"
                  label="AI Insight"
                  isActive={pathname === "/ai-insight"}
                />
                <NavItem
                  href="/qa-repos"
                  icon="/icons/IA.png"
                  label="Repositories"
                  isActive={pathname === "/qa-repos"}
                />
              </>
            )}
          </>
        )}

        {/* User Profile Menu */}
        <div className="relative ml-4" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-3 border border-gray-300 hover:border-gray-400 transition-colors py-1.5 px-3 rounded-full"
          >
            <div className="flex items-center justify-center size-7 rounded-full bg-[#9EDE30] text-sm font-bold text-black">
              {avatarLetter.toUpperCase()}
            </div>
            {isLoading ? (
              <div className="w-20 h-4 bg-gray-200 animate-pulse rounded" />
            ) : (
              <span className="text-sm font-medium pr-1">{user?.username}</span>
            )}
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-2 w-full bg-white border border-gray-100 rounded-xl shadow-md p-1 z-50">
              <button
                onClick={logout}
                className="flex items-center justify-center w-full gap-2 px-3 py-2.5 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Image
                  src="/icons/logout.png"
                  width={18}
                  height={18}
                  alt="logout"
                />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
