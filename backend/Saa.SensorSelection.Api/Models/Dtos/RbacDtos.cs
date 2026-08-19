using System.ComponentModel.DataAnnotations;

using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Models.Dtos;

// 用户
public record UserListItem(
    int Id,
    string Username,
    string DisplayName,
    bool IsActive,
    DateTime CreatedAt,
    IReadOnlyList<RoleInfo> Roles,
    OrgUnitInfo? OrgUnit);

public record CreateUserRequest(
    [Required(ErrorMessage = "请输入用户名")] string Username,
    [Required(ErrorMessage = "请输入密码")]
    [MinLength(6, ErrorMessage = "密码至少 6 位")]
    string Password,
    [Required(ErrorMessage = "请输入显示名")] string DisplayName,
    bool IsActive = true,
    int[]? RoleIds = null,
    int? OrgUnitId = null);

public record UpdateUserRequest(
    [Required(ErrorMessage = "请输入显示名")] string DisplayName,
    bool IsActive = true,
    int[]? RoleIds = null,
    int? OrgUnitId = null);

public record ResetPasswordRequest(
    [Required(ErrorMessage = "请输入密码")]
    [MinLength(6, ErrorMessage = "密码至少 6 位")]
    string Password);

// 角色与权限
public record PermissionInfo(int Id, string Code, string Name, string? Module);

public record RoleListItem(
    int Id,
    string Code,
    string Name,
    string? Description,
    bool IsSystem,
    IReadOnlyList<PermissionInfo> Permissions,
    DateTime CreatedAt);

public record CreateRoleRequest(
    [Required(ErrorMessage = "请输入角色标识")]
    [RegularExpression("^[a-zA-Z][a-zA-Z0-9:_-]*$", ErrorMessage = "角色标识仅允许字母开头，可含字母、数字、: _ -")]
    string Code,
    [Required(ErrorMessage = "请输入角色名称")] string Name,
    string? Description = null,
    int[]? PermissionIds = null);

public record UpdateRoleRequest(
    [Required(ErrorMessage = "请输入角色名称")] string Name,
    string? Description = null,
    int[]? PermissionIds = null);

// 组织架构
public record OrgUnitListItem(
    int Id,
    string Name,
    int? ParentId,
    string? Level,
    int SortOrder,
    int ChildCount,
    int UserCount);

public record CreateOrgUnitRequest(
    [Required(ErrorMessage = "请输入组织名称")]
    [MaxLength(64, ErrorMessage = "组织名称最多 64 字")]
    string Name,
    int? ParentId = null,
    [MaxLength(32, ErrorMessage = "层级名称最多 32 字")] string? Level = null,
    int SortOrder = 0);

public record UpdateOrgUnitRequest(
    [Required(ErrorMessage = "请输入组织名称")]
    [MaxLength(64, ErrorMessage = "组织名称最多 64 字")]
    string Name,
    int? ParentId = null,
    [MaxLength(32, ErrorMessage = "层级名称最多 32 字")] string? Level = null,
    int SortOrder = 0);
