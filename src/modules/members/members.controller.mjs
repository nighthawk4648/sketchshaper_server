import catchError from "../../middlewares/errors/catchError.mjs";
import responseHandler from "../../utils/responseHandler.mjs";
import * as service from "./members.service.mjs";

const ok = (res, message, data) => res.status(200).json(responseHandler(200, message, data));

class MembersController {
  list = catchError(async (req, res) => ok(res, "Members retrieved", await service.listMembers(req.query)));

  stats = catchError(async (req, res) => ok(res, "Member stats retrieved", await service.memberStats()));

  get = catchError(async (req, res) => ok(res, "Member retrieved", await service.getMember(req.params.id)));

  payments = catchError(async (req, res) => ok(res, "Payments retrieved", await service.listPayments(req.params.id)));

  addPayment = catchError(async (req, res) =>
    ok(res, "Payment recorded", await service.addPayment(req.params.id, req.body || {}, req.admin?.email)),
  );

  deletePayment = catchError(async (req, res) =>
    ok(res, "Payment deleted", await service.deletePayment(req.params.id, req.params.paymentId)),
  );

  setAccess = catchError(async (req, res) =>
    ok(res, "Access updated", await service.setAccess(req.params.id, req.body || {})),
  );
}

export default new MembersController();
