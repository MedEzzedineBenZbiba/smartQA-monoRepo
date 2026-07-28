"use client";

import { getUsers } from "@/services/users.service";
import { employee } from "@/types/employee.type";
import Image from "next/image";

import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

const LIMIT = 15;

function useDebounce(
  value: string,
  delay: number,
  setCurrentPage: Dispatch<SetStateAction<number>>,
) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
      setCurrentPage(1);
    }, delay);
    return () => clearTimeout(timer); // clears on every keystroke
  }, [value, delay]);

  return debounced;
}

export default function EmployeesList() {
  const [employees, setEmployees] = useState<employee[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const debouncedSearch = useDebounce(search, 400, setCurrentPage); // waits 400ms after typing stops
  useEffect(() => {
    const fetchEmployees = async () => {
      setLoading(true);
      const result = await getUsers(
        currentPage,
        LIMIT,
        debouncedSearch,
        selectedRoles,
      );
      if (result) {
        setEmployees(result.data);
        setTotalPages(result.totalPages);
      }
      setLoading(false);
    };
    fetchEmployees();
  }, [currentPage, debouncedSearch, selectedRoles]); // ✅ re-fetches whenever page changes

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  return (
    <div className="employeesList px-[80px] mt-[35px]">
      {/* Top bar  */}
      <div className="flex items-center justify-between mb-6">
        {/* Search  */}
        <div className="flex relative ">
          <Image
            src="/icons/search.png"
            loading="eager"
            width={46}
            height={46}
            className="size-[20px] absolute  left-[6px] top-[12px]"
            alt={"search icon"}
          />
          <input
            placeholder="Search employees"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-[35px] rounded-2xl"
          />
        </div>
        {/* {right buttons : filter and add employee} */}
        <div className="flex items-center gap-3">
          <FilterDropdown
            selectedRoles={selectedRoles}
            onChange={setSelectedRoles}
            setCurrentPage={setCurrentPage}
          />
          {/* <button className="flex items-center gap-2 bg-[#5a8a3c] hover:bg-[#4a7530] text-white rounded-full px-5 py-2 text-sm font-medium shadow-sm transition">
            + Add employee
          </button> */}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-6 py-3 text-gray-600 font-medium w-[28%]">
                Full name
              </th>
              <th className="text-left px-6 py-3 text-gray-600 font-medium w-[36%]">
                Email
              </th>
              <th className="text-left px-6 py-3 text-gray-600 font-medium w-[16%]">
                Role
              </th>
              {/* <th className="text-left px-6 py-3 text-gray-600 font-medium w-[20%]">
                Action
              </th> */}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => (
              <tr
                key={i}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-3 text-gray-800">{emp.username}</td>
                <td className="px-6 py-3 text-gray-600">{emp.email}</td>
                <td className="px-6 py-3 text-gray-800">{emp.role}</td>
                {/* <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 border border-gray-300 rounded-full px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 transition">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 0 1 2.828 2.828L11.828 15.828a2 2 0 0 1-1.414.586H8v-2.414a2 2 0 0 1 .586-1.414z"
                        />
                      </svg>
                      Edit
                    </button>
                    <button className="flex items-center gap-1.5 border border-gray-300 rounded-full px-3 py-1 text-xs text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1m-4 0h10"
                        />
                      </svg>
                      Delete
                    </button>
                  </div>
                </td> */}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pagination */}
        <div className="flex items-center justify-end gap-1 px-6 py-3 border-t border-gray-100">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition"
            disabled={currentPage === 1}
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`w-8 h-8 text-sm rounded transition ${
                currentPage === page
                  ? "bg-[#5a8a3c] text-white font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLES = ["Team lead", "Software engineer", "QA"];

type FilterDropdownProps = {
  selectedRoles: string[];
  onChange: (roles: string[]) => void;
  setCurrentPage: Dispatch<SetStateAction<number>>;
};

export function FilterDropdown({
  selectedRoles,
  onChange,
  setCurrentPage,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      onChange(selectedRoles.filter((r) => r !== role)); // uncheck
    } else {
      onChange([...selectedRoles, role]); // check
    }
    setCurrentPage(1);
  };

  const clearAll = () => {
    onChange([]);
    setCurrentPage(1);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Filter Button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-2 border rounded-full px-5 py-2 text-sm bg-white shadow-sm transition
          ${
            selectedRoles.length > 0
              ? "border-[#5a8a3c] text-[#5a8a3c]" // green when active
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4h18M7 8h10M11 12h6M15 16h2"
          />
        </svg>
        Filters
        {/* Badge showing count of selected roles */}
        {selectedRoles.length > 0 && (
          <span className="bg-[#5a8a3c] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {selectedRoles.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Filter by Role
            </span>
            {selectedRoles.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-red-400 hover:text-red-600 transition"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {ROLES.map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={selectedRoles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="hidden"
                />
                {/* Custom visual checkbox */}
                <div
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                      ${
                        selectedRoles.includes(role)
                          ? "bg-[#5a8a3c] border-[#5a8a3c]" // checked → green
                          : "bg-white border-gray-300" // unchecked → white
                      }`}
                ></div>
                {role}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
