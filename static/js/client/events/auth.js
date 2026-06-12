// Authentication events: login, register, password reset, member review.
// Loaded as plain browser script; globals shared across client scripts.
$("#loginBtn").on("click", function () {
  $.post("/api/login", { account: $("#loginAccount").val(), password: $("#loginPassword").val() })
    .done(function (res) {
      canReviewMembers = Number(res?.data?.parent_id || 0) === 0;
      $("#memberReviewNav").toggleClass("hidden", !canReviewMembers);
      loadDiseases();
      openNewCaseForm();
    })
    .fail(function (xhr) { setMsg("loginMsg", xhr.responseJSON?.message || "登录失败", true); });
});

$("#registerBtn").on("click", function () {
  $.post("/api/register", formDataFrom("#registerPanel"))
    .done(function (res) { setMsg("registerMsg", res.message); })
    .fail(function (xhr) { setMsg("registerMsg", xhr.responseJSON?.message || "注册失败", true); });
});

$("#smsBtn").on("click", function () {
  $.post("/api/password/sms", { phone: $("#resetPhone").val() })
    .done(function (res) { setMsg("resetMsg", res.message); })
    .fail(function (xhr) { setMsg("resetMsg", xhr.responseJSON?.message || "发送失败", true); });
});

$("#resetBtn").on("click", function () {
  $.post("/api/password/reset", { phone: $("#resetPhone").val(), code: $("#resetCode").val(), password: $("#resetPassword").val() })
    .done(function (res) { setMsg("resetMsg", res.message); })
    .fail(function (xhr) { setMsg("resetMsg", xhr.responseJSON?.message || "重置失败", true); });
});

function formatStatus(status) {
  if (status === "pending") return "未审核";
  if (status === "approved") return "已通过";
  if (status === "disabled") return "已禁用";
  return status || "-";
}

function loadMemberReviews() {
  if (!canReviewMembers) {
    $("#memberReviewBody").html('<tr><td colspan="4">无权限查看</td></tr>');
    return;
  }

  $.getJSON("/api/member-reviews")
    .done(function (res) {
      if (!res.success) {
        $("#memberReviewBody").html('<tr><td colspan="4">加载失败</td></tr>');
        return;
      }
      if (!res.data.length) {
        $("#memberReviewBody").html('<tr><td colspan="4">暂无可审核会员</td></tr>');
        return;
      }

      const html = res.data.map(function (user) {
        const action = user.status === "pending"
          ? '<button class="btn-sm approve-member-btn" data-id="' + user.id + '">通过</button>'
          : '-';
        return '<tr>' +
          '<td>' + (user.name || '-') + '</td>' +
          '<td>' + (user.phone || '-') + '</td>' +
          '<td>' + formatStatus(user.status) + '</td>' +
          '<td>' + action + '</td>' +
          '</tr>';
      }).join('');
      $("#memberReviewBody").html(html);
    })
    .fail(function (xhr) {
      $("#memberReviewBody").html('<tr><td colspan="4">加载失败</td></tr>');
      setMsg("memberReviewMsg", xhr.responseJSON?.message || "加载失败", true);
    });
}

$(document).on("click", ".approve-member-btn", function () {
  const targetUserId = $(this).data("id");
  $.post("/api/member-reviews/" + targetUserId + "/approve")
    .done(function (res) {
      setMsg("memberReviewMsg", res.message || "操作成功");
      loadMemberReviews();
    })
    .fail(function (xhr) {
      setMsg("memberReviewMsg", xhr.responseJSON?.message || "操作失败", true);
    });
});
