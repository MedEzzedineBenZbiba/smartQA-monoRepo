import { type Employee } from "@/types/employee.type";

export default function Employee({ username, email, role }: Employee) {
  return (
    <tr>
      <td>{username}</td>
      <td>{email}</td>
      <td>{role}</td>
      <td>
        <button>Edit</button>
        <button>Delete</button>
      </td>
    </tr>
  );
}
