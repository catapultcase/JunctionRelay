/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024-present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

using Microsoft.AspNetCore.DataProtection;

namespace JunctionRelayServer.Services
{
    public class Service_AuthCookieManager
    {
        private readonly IDataProtector _protector;

        public const string SessionCookieName = "jr_session";

        public Service_AuthCookieManager(IDataProtectionProvider provider)
        {
            _protector = provider.CreateProtector("JR.Server.Auth.Cookies");
        }

        public string Encrypt(string value) => _protector.Protect(value);

        public string? Decrypt(string value)
        {
            try
            {
                return _protector.Unprotect(value);
            }
            catch
            {
                return null;
            }
        }

        public void SetSessionCookie(HttpResponse response, string jwt, int expiresInSeconds)
        {
            var isHttps = response.HttpContext.Request.Scheme == "https";
            response.Cookies.Append(SessionCookieName, Encrypt(jwt), new CookieOptions
            {
                HttpOnly = true,
                Secure = isHttps,
                SameSite = SameSiteMode.Strict,
                MaxAge = TimeSpan.FromSeconds(expiresInSeconds),
                Path = "/"
            });
        }

        public void ClearSessionCookie(HttpResponse response)
        {
            var isHttps = response.HttpContext.Request.Scheme == "https";
            response.Cookies.Delete(SessionCookieName, new CookieOptions
            {
                HttpOnly = true,
                Secure = isHttps,
                SameSite = SameSiteMode.Strict,
                Path = "/"
            });
        }

        public string? GetDecryptedToken(HttpRequest request)
        {
            if (request.Cookies.TryGetValue(SessionCookieName, out var encrypted))
            {
                return Decrypt(encrypted);
            }
            return null;
        }
    }
}
