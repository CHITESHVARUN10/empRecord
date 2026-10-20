class HttpError extends Error {
  status;
  code;
  fields;
  conflicts;
  constructor(status, code, message, options) {
    super(message, options?.cause ? { cause: options.cause } : void 0);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = options?.fields;
    this.conflicts = options?.conflicts;
  }
}
export {
  HttpError
};
