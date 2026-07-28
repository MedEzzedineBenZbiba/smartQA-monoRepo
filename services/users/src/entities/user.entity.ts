import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { UserRole } from './userRole.enum';
import { UserGender } from './userGender.enum';

@Entity()
export class User {
  @PrimaryColumn()
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ unique: true })
  username!: string;

  @Column({
    type: 'enum',
    enum: UserGender,
  })
  gender!: UserGender;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.SoftwareDev,
  })
  role!: UserRole;

  @Column({ nullable: true })
  resetPasswordToken!: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastIngestionDate!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
