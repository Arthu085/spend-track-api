import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { PaginatedResult } from '@shared/application/dto';
import type { UserEntity } from '../../../domain/entities/user.entity';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { ListUsersUseCase, type ListUsersInput } from '../list-users.use-case';

function buildInput(overrides: Partial<ListUsersInput> = {}): ListUsersInput {
  return { page: 1, limit: 20, ...overrides };
}

describe('ListUsersUseCase', () => {
  it('paginates through the repository and wraps the result in a PaginatedResult', async () => {
    const items = [{ uuid: 'user-1' } as UserEntity];

    const findAllPaginated = jest.fn().mockResolvedValue({ items, total: 1 });

    const userRepository = {
      findAllPaginated,
    } as unknown as UserRepository;

    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput();

    const result = await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: undefined,
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
    expect(result).toBeInstanceOf(PaginatedResult);
    expect(result.items).toBe(items);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('forwards a trimmed name filter to the repository', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({ name: '  ali  ' });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: 'ali',
      email: undefined,
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
  });

  it('forwards a trimmed email filter to the repository', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({ email: '  jane@example.com  ' });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: 'jane@example.com',
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
  });

  it('treats a whitespace-only name as no filter', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({ name: '   ' });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: undefined,
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
  });

  it('treats a whitespace-only email as no filter', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({ email: '   ' });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: undefined,
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
  });

  it('passes the role filter through unchanged', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({ role: 'role-uuid' });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: undefined,
      role: 'role-uuid',
      status: RecordStatus.ACTIVE,
    });
  });

  it('passes the status filter through unchanged', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({ status: RecordStatus.INACTIVE });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: undefined,
      role: undefined,
      status: RecordStatus.INACTIVE,
    });
  });

  it('combines all filters when several are set at once', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput({
      name: '  ali  ',
      email: '  ali@example.com  ',
      role: 'role-uuid',
      status: RecordStatus.ACTIVE,
    });

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: 'ali',
      email: 'ali@example.com',
      role: 'role-uuid',
      status: RecordStatus.ACTIVE,
    });
  });

  it('defaults status to ACTIVE and treats other omitted filters as no filter', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 0 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const input = buildInput();

    await useCase.execute(input);

    expect(findAllPaginated).toHaveBeenCalledWith(0, 20, {
      name: undefined,
      email: undefined,
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
  });

  it('derives the repository offset from page and limit', async () => {
    const findAllPaginated = jest
      .fn()
      .mockResolvedValue({ items: [], total: 45 });

    const userRepository = { findAllPaginated } as unknown as UserRepository;
    const useCase = new ListUsersUseCase(userRepository);

    const result = await useCase.execute(buildInput({ page: 3, limit: 10 }));

    expect(findAllPaginated).toHaveBeenCalledWith(20, 10, {
      name: undefined,
      email: undefined,
      role: undefined,
      status: RecordStatus.ACTIVE,
    });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(45);
  });
});
